const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const { AiProduct } = require('../models');

const PREVIEW_TOKEN_PURPOSE = 'ai-product-preview';
const PREVIEW_TOKEN_TTL = '24h';

const slugify = (name) =>
    name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

// Generate a unique slug; appends -2, -3, ... on collision.
// excludeId lets updates keep their own slug without self-colliding.
const generateUniqueSlug = async (name, excludeId = null) => {
    const base = slugify(name) || 'ai-product';
    const where = { slug: { [Op.iLike]: `${base}%` } };
    if (excludeId) where.id = { [Op.ne]: excludeId };

    const existing = await AiProduct.findAll({ where, attributes: ['slug'] });
    const taken = new Set(existing.map((p) => p.slug));

    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
};

const isSlugTaken = async (slug, excludeId = null) => {
    const where = { slug };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const existing = await AiProduct.findOne({ where, attributes: ['id'] });
    return !!existing;
};

// Slim payload for the public listing grid — only what the card renders.
const toCard = (p) => {
    const c = p.content || {};
    return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        tagline: c.tagline || '',
        description: c.description || '',
        tags: c.tags || [],
        thumbnailUrl: c.thumbnailUrl || '',
        teamName: (c.team && c.team.name) || '',
    };
};

// ---------- Public ----------

// GET /ai-products — published cards, ordered
exports.getPublished = async (req, res) => {
    try {
        const products = await AiProduct.findAll({
            where: { status: 'published' },
            order: [
                ['display_order', 'ASC'],
                ['createdAt', 'DESC'],
            ],
        });
        res.json(products.map(toCard));
    } catch (err) {
        console.error('aiProduct getPublished error', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
};

// GET /ai-products/slug/:slug — full published product
exports.getBySlug = async (req, res) => {
    try {
        const product = await AiProduct.findOne({
            where: { slug: req.params.slug, status: 'published' },
        });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (err) {
        console.error('aiProduct getBySlug error', err);
        res.status(500).json({ error: 'Failed to fetch product' });
    }
};

// GET /ai-products/preview/:id?token= — full product regardless of status.
// Used by the public site's preview route; requires a signed preview token
// so draft content can't be read by guessing ids.
exports.getPreview = async (req, res) => {
    try {
        const { token } = req.query;
        let payload;
        try {
            payload = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({ error: 'Invalid or expired preview link' });
        }
        if (payload.purpose !== PREVIEW_TOKEN_PURPOSE || payload.id !== req.params.id) {
            return res.status(401).json({ error: 'Invalid or expired preview link' });
        }

        const product = await AiProduct.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (err) {
        console.error('aiProduct getPreview error', err);
        res.status(500).json({ error: 'Failed to fetch preview' });
    }
};

// ---------- Admin ----------

// GET /ai-products/:id/preview-token — short-lived token for the preview URL
exports.getPreviewToken = async (req, res) => {
    try {
        const product = await AiProduct.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const token = jwt.sign(
            { id: product.id, purpose: PREVIEW_TOKEN_PURPOSE },
            process.env.JWT_SECRET,
            { expiresIn: PREVIEW_TOKEN_TTL }
        );
        res.json({ token });
    } catch (err) {
        console.error('aiProduct getPreviewToken error', err);
        res.status(500).json({ error: 'Failed to create preview token' });
    }
};

// POST /ai-products/:id/duplicate — copy as a new draft
exports.duplicate = async (req, res) => {
    try {
        const source = await AiProduct.findByPk(req.params.id);
        if (!source) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const name = `${source.name} (copy)`;
        const maxOrder = (await AiProduct.max('display_order')) || 0;
        const product = await AiProduct.create({
            name,
            slug: await generateUniqueSlug(name),
            status: 'draft',
            display_order: maxOrder + 1,
            content: source.content,
        });
        res.status(201).json(product);
    } catch (err) {
        console.error('aiProduct duplicate error', err);
        res.status(500).json({ error: 'Failed to duplicate product' });
    }
};

// GET /ai-products/admin — all products incl. drafts
exports.getAllAdmin = async (req, res) => {
    try {
        const products = await AiProduct.findAll({
            order: [
                ['display_order', 'ASC'],
                ['createdAt', 'DESC'],
            ],
        });
        res.json(products);
    } catch (err) {
        console.error('aiProduct getAllAdmin error', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
};

// GET /ai-products/:id — single product (drafts included)
exports.getByIdAdmin = async (req, res) => {
    try {
        const product = await AiProduct.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (err) {
        console.error('aiProduct getByIdAdmin error', err);
        res.status(500).json({ error: 'Failed to fetch product' });
    }
};

// POST /ai-products — create draft
exports.create = async (req, res) => {
    try {
        const { name, slug, content } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // User-provided slug wins; auto-generate only when none is given.
        let finalSlug;
        if (slug && slug.trim()) {
            finalSlug = slugify(slug);
            if (!finalSlug) {
                return res.status(400).json({ error: 'Invalid slug' });
            }
            if (await isSlugTaken(finalSlug)) {
                return res.status(409).json({ error: 'Slug already in use' });
            }
        } else {
            finalSlug = await generateUniqueSlug(name);
        }

        const maxOrder = (await AiProduct.max('display_order')) || 0;
        const product = await AiProduct.create({
            name: name.trim(),
            slug: finalSlug,
            status: 'draft',
            display_order: maxOrder + 1,
            content: content || {},
        });
        res.status(201).json(product);
    } catch (err) {
        console.error('aiProduct create error', err);
        res.status(500).json({ error: 'Failed to create product' });
    }
};

// PATCH /ai-products/:id — update name/content/status; re-slugs when name changes
exports.update = async (req, res) => {
    try {
        const product = await AiProduct.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const { name, slug, content, status } = req.body;
        const updates = {};

        if (name !== undefined) {
            if (!name.trim()) {
                return res.status(400).json({ error: 'Name cannot be empty' });
            }
            updates.name = name.trim();
        }

        // Slug only changes when explicitly sent — renaming never re-slugs.
        if (slug !== undefined) {
            const cleaned = slugify(slug || '');
            if (!cleaned) {
                return res.status(400).json({ error: 'Invalid slug' });
            }
            if (cleaned !== product.slug) {
                if (await isSlugTaken(cleaned, product.id)) {
                    return res.status(409).json({ error: 'Slug already in use' });
                }
                updates.slug = cleaned;
            }
        }
        if (content !== undefined) updates.content = content;
        if (status !== undefined) {
            if (!['draft', 'published'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }
            updates.status = status;
        }

        await product.update(updates);
        res.json(product);
    } catch (err) {
        console.error('aiProduct update error', err);
        res.status(500).json({ error: 'Failed to update product' });
    }
};

// PATCH /ai-products/reorder — body: { order: [{ id, display_order }] }
exports.reorder = async (req, res) => {
    try {
        const { order } = req.body;
        if (!Array.isArray(order)) {
            return res.status(400).json({ error: 'order must be an array' });
        }
        await Promise.all(
            order.map(({ id, display_order }) =>
                AiProduct.update({ display_order }, { where: { id } })
            )
        );
        res.json({ success: true });
    } catch (err) {
        console.error('aiProduct reorder error', err);
        res.status(500).json({ error: 'Failed to reorder products' });
    }
};

// DELETE /ai-products/:id
exports.remove = async (req, res) => {
    try {
        const deleted = await AiProduct.destroy({ where: { id: req.params.id } });
        if (!deleted) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('aiProduct remove error', err);
        res.status(500).json({ error: 'Failed to delete product' });
    }
};
