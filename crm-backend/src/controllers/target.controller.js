const service = require('../services/target.service');

const listPacing = async (req, res) => {
  try {
    const rows = await service.listTargetsForUser(req.user);
    res.json({ rows });
  } catch (err) {
    console.error('Target pacing error:', err);
    res.status(500).json({ error: 'Failed to load target pacing.' });
  }
};

const listAll = async (req, res) => {
  try {
    if (req.user.role === 'Agent') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await service.listAllTargets(req.user);
    res.json({ rows });
  } catch (err) {
    console.error('Target list error:', err);
    res.status(500).json({ error: 'Failed to list targets.' });
  }
};

const create = async (req, res) => {
  try {
    if (req.user.role === 'Agent') return res.status(403).json({ error: 'Forbidden.' });
    const target = await service.createTarget(req.user, req.body || {});
    res.status(201).json({ target });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create target.' });
  }
};

const update = async (req, res) => {
  try {
    if (req.user.role === 'Agent') return res.status(403).json({ error: 'Forbidden.' });
    const target = await service.updateTarget(req.user, req.params.id, req.body || {});
    res.json({ target });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update target.' });
  }
};

const remove = async (req, res) => {
  try {
    if (req.user.role === 'Agent') return res.status(403).json({ error: 'Forbidden.' });
    await service.deleteTarget(req.user, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to delete target.' });
  }
};

module.exports = { listPacing, listAll, create, update, remove };
