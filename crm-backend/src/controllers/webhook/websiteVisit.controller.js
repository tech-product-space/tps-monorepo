const websiteVisitService = require('../../services/websiteVisit.service');
const { verifyWebsiteSignature } = require('../../utils/websiteSignature');

/**
 * POST /api/v1/webhooks/website-visit
 *
 * Always answers 200 once the signature is good and the body parses, including
 * for duplicates — TPS sends and moves on, and a non-200 would only make it retry
 * something we have deliberately ignored. Genuine failures return 500 so the
 * hourly catch-up brings the visit back.
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

  try {
    const result = await websiteVisitService.ingest(payload);
    return res.status(200).json(result);
  } catch (err) {
    console.error(
      `Website visit ingest failed (event ${payload?.source_event_id}):`,
      err.message,
    );
    // 500 on purpose: the catch-up should retry this one.
    return res.status(500).json({ error: 'Failed to record visit' });
  }
};
