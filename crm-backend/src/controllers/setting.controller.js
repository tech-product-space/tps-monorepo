const { Status, Product, sequelize } = require('../models');
const businessSettingsService = require('../services/businessSettings.service');
const { generatePreviewPdf } = require('../services/pdf.service');

const PREVIEW_TYPES = ['receipt', 'invoice', 'statement'];

exports.getStatuses = async (req, res) => {
  try {
    const statuses = await Status.findAll({
      order: [['sort_order', 'ASC']]
    });
    res.json({ success: true, data: statuses });
  } catch (error) {
    console.error('Error fetching statuses:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch statuses' });
  }
};

exports.createStatus = async (req, res) => {
  try {
    const { label, color, isDeactivated } = req.body;
    
    // Generate a simple ID like s_label + hash
    const hash = Math.random().toString(36).substring(2, 7);
    const id = 's_' + label.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + hash;

    const maxOrderStatus = await Status.findOne({
      order: [['sort_order', 'DESC']]
    });
    const nextOrder = maxOrderStatus ? maxOrderStatus.sort_order + 1 : 0;

    const newStatus = await Status.create({
      id,
      label,
      color,
      is_deactivated: isDeactivated || false,
      sort_order: nextOrder
    });

    res.status(201).json({ success: true, data: newStatus });
  } catch (error) {
    console.error('Error creating status:', error);
    res.status(500).json({ success: false, error: 'Failed to create status' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, color, isDeactivated } = req.body;

    const status = await Status.findByPk(id);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Status not found' });
    }

    if (label !== undefined) status.label = label;
    if (color !== undefined) status.color = color;
    if (isDeactivated !== undefined) status.is_deactivated = isDeactivated;

    await status.save();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
};

exports.reorderStatuses = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { newOrder } = req.body; // Array of { id, order }

    for (const item of newOrder) {
      await Status.update(
        { sort_order: item.order },
        { where: { id: item.id }, transaction }
      );
    }

    await transaction.commit();
    res.json({ success: true, message: 'Statuses reordered successfully' });
  } catch (error) {
    await transaction.rollback();
    console.error('Error reordering statuses:', error);
    res.status(500).json({ success: false, error: 'Failed to reorder statuses' });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      order: [['sort_order', 'ASC']],
      include: [
        { model: require('../models').User, as: 'AssignedManager', attributes: ['id', 'name'] }
      ]
    });
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
};

/* ─── Business / Invoice settings ───────────────────────────────────────────── */

exports.getBusinessSettings = async (req, res) => {
  try {
    const settings = await businessSettingsService.getBusinessSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching business settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch business settings' });
  }
};

exports.updateBusinessSettings = async (req, res) => {
  try {
    const settings = await businessSettingsService.updateBusinessSettings(req.body || {});
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error updating business settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update business settings' });
  }
};

/**
 * Generate a sample receipt / invoice / statement PDF so an admin can preview
 * how documents look with their branding. Reflects the (possibly unsaved)
 * settings posted from the form; falls back to the saved config otherwise.
 */
exports.previewBusinessDocument = async (req, res) => {
  try {
    const type = String(req.query.type || req.body?.type || 'receipt');
    if (!PREVIEW_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid preview type' });
    }

    const payload = req.body || {};
    const hasPayload = Object.keys(payload).some((k) => k !== 'type');
    const business = hasPayload
      ? businessSettingsService.buildConfigFromPayload(payload)
      : await businessSettingsService.getBusinessConfig();

    const pdf = await generatePreviewPdf(type, business);
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${label}-Preview.pdf"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (error) {
    console.error('Error generating document preview:', error);
    res.status(500).json({ success: false, error: 'Failed to generate preview' });
  }
};

exports.updateProductConfig = async (req, res) => {
  try {
    const { productLabel } = req.params;
    const { intent_tier, assigned_manager_id } = req.body;

    const product = await Product.findOne({ where: { label: productLabel } });
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    if (intent_tier !== undefined) product.intent_tier = intent_tier;
    if (assigned_manager_id !== undefined) product.assigned_manager_id = assigned_manager_id || null;

    await product.save();

    res.json({ success: true, data: product });
  } catch (error) {
    console.error('Error updating product config:', error);
    res.status(500).json({ success: false, error: 'Failed to update product config' });
  }
};
