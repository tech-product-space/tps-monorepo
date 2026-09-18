/**
 * A gateway rejection, normalized into a real Error.
 *
 * Exists because the SDKs disagree about what a failure even is. The Razorpay
 * client throws a PLAIN OBJECT — `{ statusCode, error: { code, description } }`
 * — with no `message` and no Error prototype, so `err.message` is `undefined`
 * and `JSON.stringify` silently drops it from the response body. Cashfree
 * rejects with a raw axios error whose `message` is the useless
 * "Request failed with status code 400", the real reason being buried in
 * `response.data`. Either way the operator saw a blank failure.
 *
 * Providers translate their own SDK's shape into this one so callers can log
 * and surface a single thing.
 *
 * `notCancellable` is the flag that matters: the gateway refused not because
 * anything went wrong, but because the link is no longer live (already paid,
 * expired or cancelled on their side). That is a reconcile signal, not an
 * error — see cancelPaymentLink.
 */
class GatewayError extends Error {
  constructor(message, { provider, code, statusCode, notCancellable = false } = {}) {
    super(message);
    this.name = "GatewayError";
    this.provider = provider || null;
    /** The gateway's own error code, e.g. 'BAD_REQUEST_ERROR', 'link_not_active'. */
    this.code = code || null;
    this.statusCode = statusCode || null;
    this.notCancellable = notCancellable;
  }
}

module.exports = { GatewayError };
