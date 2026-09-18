const websiteActivityService = require('../../services/websiteActivity.service');
const { verifyWebsiteSignature } = require('../../utils/websiteSignature');

/**
 * POST /api/v1/webhooks/website-activity
 *
 * Bulk sibling of the single-visit webhook. Same shared secret, same raw-body
 * signature, but it takes a batch and never touches a lead.
 *
 * Accepts either shape, so the sender can grow without a version bump:
 *
 *   [ {...}, {...} ]
 *   { "events": [ {...}, {...} ] }
 *
 * Status codes are chosen for the caller, which is a BullMQ worker with retries:
 *
 *   401  bad or missing signature      do not retry, it will never work
 *   400  unparseable or wrong shape    do not retry, same reason
 *   413  batch over the cap            do not retry, split it instead
 *   200  written                       stamp crmSyncedAt and move on
 *   500  we failed                     retry — the row is still unsynced
 *
 * A partially valid batch still returns 200. Rows missing an id, a browser id or
 * a page are counted in `skipped` rather than failing the batch, because one
 * malformed row must not hold up the other four hundred behind it.
 */
exports.handle = async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

  if (!verifyWebsiteSignature(raw, req.headers['x-website-visit-signature'])) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  const events = Array.isArray(payload) ? payload : payload?.events;

  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'Expected an array, or { events: [...] }' });
  }

  if (events.length > websiteActivityService.MAX_BATCH) {
    return res.status(413).json({
      error: `Batch too large: ${events.length} (max ${websiteActivityService.MAX_BATCH})`,
    });
  }

  try {
    const result = await websiteActivityService.ingestBatch(events);
    return res.status(200).json(result);
  } catch (err) {
    console.error(`Website activity batch failed (${events.length} rows):`, err.message);
    // 500 on purpose: these rows are still unsynced upstream, and the worker
    // should bring them back.
    return res.status(500).json({ error: 'Failed to record activity' });
  }
};
