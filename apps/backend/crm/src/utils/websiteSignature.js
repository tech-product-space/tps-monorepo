const crypto = require('crypto');

/**
 * Shared-secret check for everything TPS sends us.
 *
 * These are machine-to-machine calls, so there is no JWT and no role check — the
 * secret is the whole of the authentication. Two rules make it trustworthy:
 *
 * 1. It is verified against the RAW request body (hence express.raw on the
 *    routes) rather than a re-serialised object. Re-stringifying JSON can
 *    reorder keys and change whitespace, which breaks the signature for reasons
 *    that are miserable to debug.
 *
 * 2. timingSafeEqual, not ===, so a wrong secret cannot be recovered by
 *    measuring how long the comparison takes.
 *
 * Lives here rather than in one controller because two endpoints now need it —
 * the single-visit webhook and the bulk activity one — and two copies of a
 * signature check are two chances for them to drift apart.
 */
const verifyWebsiteSignature = (rawBody, header) => {
  const secret = process.env.WEBSITE_VISIT_SECRET;

  // Refuse rather than run open. An unset secret must not mean "let everyone in".
  if (!secret) return false;
  if (!header || typeof header !== 'string') return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const given = header.startsWith('sha256=') ? header.slice(7) : header;

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

module.exports = { verifyWebsiteSignature };
