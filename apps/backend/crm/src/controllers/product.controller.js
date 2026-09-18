const { Product, Subsource, Lead } = require('../models');
const { fn, col, Op } = require('sequelize');
const permission = require('../services/permission.service');

const isSuperadmin = (req) => req.user && req.user.role === 'Superadmin';

// Get all products
// - Non-Superadmin: only accessible (non-archived) products + accessible subsources.
// - Superadmin: everything; `?includeDeleted=true` also returns archived rows,
//   each annotated with its access rules and (for archived) a live lead count.
exports.getAllProducts = async (req, res) => {
  try {
    const user = req.user;
    const superadmin = isSuperadmin(req);

    // Management view (settings): a Superadmin explicitly requesting archived
    // rows. This view intentionally BYPASSES access scope + soft-delete so an
    // admin can always see and manage every product — including ones they have
    // restricted themselves from in the operational leads workspace. This is the
    // safety valve that makes Superadmin-level restrictions non-destructive.
    const managementMode = superadmin && req.query.includeDeleted === 'true';

    // Operational calls (LeadContext for everyone, INCLUDING Superadmins) are
    // access-scoped. null = no restriction configured -> see all.
    let productIds = null;
    let subsourceIds = null;
    if (!managementMode) {
      productIds = await permission.accessibleResourceIds(user, 'product', 'view');
      subsourceIds = await permission.accessibleResourceIds(user, 'subsource', 'view');
    }

    const where = {};
    if (productIds !== null) where.id = { [Op.in]: productIds };

    const products = await Product.findAll({
      where,
      order: [['sort_order', 'ASC'], ['created_at', 'DESC']],
      paranoid: !managementMode,
      include: [
        {
          model: Subsource,
          as: 'Subsources',
          attributes: ['id', 'label', 'is_active', 'sort_order', 'product_id', 'deleted_at'],
          required: false,
          paranoid: !managementMode,
        },
      ],
    });

    const result = products.map((p) => p.toJSON());

    // Filter nested subsources by subsource-level access (nested: product access
    // already gated the product above).
    if (subsourceIds !== null) {
      const allowed = new Set(subsourceIds);
      for (const p of result) {
        p.Subsources = (p.Subsources || []).filter((s) => allowed.has(s.id));
      }
    }

    if (managementMode) {
      // Attach access rules so the settings UI can render Everyone/Restricted.
      const pIds = result.map((p) => p.id);
      const sIds = result.flatMap((p) => (p.Subsources || []).map((s) => s.id));
      const [pAccess, sAccess] = await Promise.all([
        permission.getGrantsMap('product', pIds),
        permission.getGrantsMap('subsource', sIds),
      ]);

      // Live lead counts for archived products so admins notice inflow.
      const deletedIds = result.filter((p) => p.deleted_at).map((p) => p.id);
      let countMap = {};
      if (deletedIds.length) {
        const counts = await Lead.findAll({
          attributes: ['product_id', [fn('COUNT', col('id')), 'cnt']],
          where: { product_id: { [Op.in]: deletedIds }, is_deleted: false },
          group: ['product_id'],
          raw: true,
        });
        countMap = Object.fromEntries(counts.map((c) => [c.product_id, Number(c.cnt)]));
      }

      for (const p of result) {
        p.access = pAccess[p.id] || { roles: [], users: [] };
        p.leadCount = countMap[p.id] || 0;
        for (const s of p.Subsources || []) {
          s.access = sAccess[s.id] || { roles: [], users: [] };
        }
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Get All Products Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

//Create Product
exports.createProduct = async (req, res) => {
  try {
    const {
      id,
      label,
      assigned_manager_id,
      intent_tier,
      is_active,
      sort_order
    } = req.body;

    // Basic validation
    if (!id || !label) {
      return res.status(400).json({ message: 'id and label are required' });
    }

    const managerId = assigned_manager_id && assigned_manager_id.trim() !== ''
      ? assigned_manager_id
      : null;

    // Look up including archived rows so a reused id auto-restores instead of
    // hitting the primary-key constraint.
    const existing = await Product.findByPk(id, { paranoid: false });
    if (existing) {
      if (existing.deleted_at) {
        await Product.sequelize.transaction(async (transaction) => {
          await existing.restore({ transaction });
          await existing.update(
            {
              label,
              assigned_manager_id: managerId,
              intent_tier: intent_tier || existing.intent_tier || 'Low',
              is_active: is_active !== undefined ? is_active : true,
            },
            { transaction },
          );
          // Bring back the subsources that were archived alongside it.
          await Subsource.restore({ where: { product_id: id }, transaction });
        });
        return res.status(200).json({ ...existing.toJSON(), restored: true });
      }
      return res.status(409).json({ message: 'Product with this ID already exists' });
    }

    const product = await Product.create({
      id,
      label,
      assigned_manager_id: managerId,
      intent_tier: intent_tier || 'Low',
      is_active: is_active !== undefined ? is_active : true,
      sort_order: sort_order ?? ((await Product.max('sort_order') ?? -1) + 1)
    });

    return res.status(201).json(product);
  } catch (error) {
    console.error('Create Product Error:', error);

    // Send more specific error messages
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        errors: error.errors.map(e => e.message)
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Product with this ID already exists' });
    }

    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await product.update(req.body);

    return res.status(200).json(product);
  } catch (error) {
    console.error('Update Product Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Soft-delete (archive): sets deleted_at and cascades to the product's
// subsources in one transaction. Existing leads keep their product_id (the row
// survives), so nothing is orphaned and external ingestion can still resolve it.
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await Product.sequelize.transaction(async (transaction) => {
      await Subsource.destroy({ where: { product_id: id }, transaction });
      await product.destroy({ transaction });
    });

    return res.status(200).json({ message: 'Product archived successfully' });
  } catch (error) {
    console.error('Delete Product Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Restore an archived product and its subsources.
exports.restoreProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id, { paranoid: false });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await Product.sequelize.transaction(async (transaction) => {
      await product.restore({ transaction });
      await Subsource.restore({ where: { product_id: id }, transaction });
    });

    return res.status(200).json({ message: 'Product restored successfully', product });
  } catch (error) {
    console.error('Restore Product Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


// ── Subsource CRUD ──

exports.getSubsources = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const subsources = await Subsource.findAll({
      where: { product_id: id },
      order: [['sort_order', 'ASC']],
    });

    // Scope to accessible subsources for non-Superadmin.
    const allowedIds = await permission.accessibleResourceIds(req.user, 'subsource', 'view');
    const scoped = allowedIds === null
      ? subsources
      : subsources.filter((s) => allowedIds.includes(s.id));

    return res.status(200).json(scoped);
  } catch (error) {
    console.error('Get Subsources Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createSubsource = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { label, is_active, sort_order } = req.body;

    if (!label) {
      return res.status(400).json({ message: 'label is required' });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const id = `${productId}__${label}`.replace(/\s+/g, '_').slice(0, 50);

    // Include archived rows so a reused id/label auto-restores.
    const existing = await Subsource.findOne({
      where: {
        [Op.or]: [
          { label, product_id: productId },
          { id },
        ],
      },
      paranoid: false,
    });

    if (existing) {
      if (existing.deleted_at) {
        await existing.restore();
        await existing.update({
          label,
          is_active: is_active !== undefined ? is_active : true,
        });
        return res.status(200).json({ ...existing.toJSON(), restored: true });
      }
      const reason = existing.id === id
        ? 'Subsource with this ID already exists'
        : 'Subsource with this label already exists for this product';
      return res.status(409).json({ message: reason });
    }

    const subsource = await Subsource.create({
      id,
      label,
      product_id: productId,
      is_active: is_active !== undefined ? is_active : true,
      sort_order: sort_order ?? ((await Subsource.max('sort_order', { where: { product_id: productId } }) ?? -1) + 1),
    });

    return res.status(201).json(subsource);
  } catch (error) {
    console.error('Create Subsource Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateSubsource = async (req, res) => {
  try {
    const { subsourceId } = req.params;

    const subsource = await Subsource.findByPk(subsourceId);
    if (!subsource) {
      return res.status(404).json({ message: 'Subsource not found' });
    }

    await subsource.update(req.body);

    return res.status(200).json(subsource);
  } catch (error) {
    console.error('Update Subsource Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Soft-delete (archive) a single subsource.
exports.deleteSubsource = async (req, res) => {
  try {
    const { subsourceId } = req.params;

    const subsource = await Subsource.findByPk(subsourceId);
    if (!subsource) {
      return res.status(404).json({ message: 'Subsource not found' });
    }

    await subsource.destroy();

    return res.status(200).json({ message: 'Subsource archived successfully' });
  } catch (error) {
    console.error('Delete Subsource Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Restore an archived subsource.
exports.restoreSubsource = async (req, res) => {
  try {
    const { subsourceId } = req.params;

    const subsource = await Subsource.findByPk(subsourceId, { paranoid: false });
    if (!subsource) {
      return res.status(404).json({ message: 'Subsource not found' });
    }

    await subsource.restore();

    return res.status(200).json({ message: 'Subsource restored successfully', subsource });
  } catch (error) {
    console.error('Restore Subsource Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


// ── Access control (per product / per subsource) ──

exports.getProductAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const access = await permission.getGrantsFor('product', id, 'view');
    return res.status(200).json(access);
  } catch (error) {
    console.error('Get Product Access Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.setProductAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const { roles = [], users = [] } = req.body || {};
    const access = await permission.setGrantsFor('product', id, {
      roles,
      users,
      action: 'view',
      createdBy: req.user?.id || null,
    });
    return res.status(200).json(access);
  } catch (error) {
    console.error('Set Product Access Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getSubsourceAccess = async (req, res) => {
  try {
    const { subsourceId } = req.params;
    const access = await permission.getGrantsFor('subsource', subsourceId, 'view');
    return res.status(200).json(access);
  } catch (error) {
    console.error('Get Subsource Access Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.setSubsourceAccess = async (req, res) => {
  try {
    const { subsourceId } = req.params;
    const { roles = [], users = [] } = req.body || {};
    const access = await permission.setGrantsFor('subsource', subsourceId, {
      roles,
      users,
      action: 'view',
      createdBy: req.user?.id || null,
    });
    return res.status(200).json(access);
  } catch (error) {
    console.error('Set Subsource Access Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


exports.updateProductSortOrder = async (req, res) => {
  // Payload is validated BEFORE the transaction is opened. When these checks
  // lived inside the try block they returned 400 without commit or rollback,
  // which leaked a pooled connection on every bad request.
  const updates = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  for (const item of updates) {
    if (!item.id || typeof item.sort_order !== 'number') {
      return res.status(400).json({
        message: 'Each item must have id and sort_order (number)'
      });
    }
  }

  const t = await Product.sequelize.transaction();

  try {
    await Promise.all(
      updates.map(item =>
        Product.update(
          { sort_order: item.sort_order },
          { where: { id: item.id }, transaction: t }
        )
      )
    );

    await t.commit();

    return res.status(200).json({
      message: 'Sort order updated successfully'
    });

  } catch (error) {
    await t.rollback();
    console.error('Update Sort Order Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
