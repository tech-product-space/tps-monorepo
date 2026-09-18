const { getProvider } = require("../../config/payment/providers");
const paymentService = require("../../services/payment.service");

/**
 * Generic payment-webhook handler. One implementation for every gateway:
 * verify the signature, parse the body into a normalized event via the
 * provider, then apply it. Adding a gateway needs only its provider module +
 * a route line — no new controller logic.
 *
 * Mounted with express.raw so the raw body is available for signature checks.
 */
exports.handle = (providerKey) => async (req, res) => {
  try {
    const provider = getProvider(providerKey);
    if (!provider) {
      return res.status(404).json({ message: "Unknown provider" });
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : String(req.body || "");

    console.log(`[webhook:${providerKey}] Received — headers:`, {
      "x-webhook-signature": req.headers["x-webhook-signature"] ? "present" : "MISSING",
      "x-webhook-timestamp": req.headers["x-webhook-timestamp"] || "MISSING",
      "content-type": req.headers["content-type"],
    }, "| rawBody length:", rawBody.length);

    if (!provider.verifyWebhook(req, rawBody)) {
      console.error(`[webhook:${providerKey}] Rejected — raw body snippet:`, rawBody.slice(0, 200));
      return res.status(400).json({ message: "Invalid signature" });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ message: "Invalid payload" });
    }

    console.log(`[webhook:${providerKey}] Event accepted:`, body.type || "(no type)", JSON.stringify(body).slice(0, 300));

    const event = provider.parseWebhook(body);
    if (event) {
      await paymentService.applyPaymentEvent(event);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error(`${providerKey} webhook error:`, error);
    return res.status(500).json({ message: "Webhook processing failed" });
  }
};
