const { PushSubscription } = require("../models");
const { webpush, isConfigured } = require("../config/webpush");

/**
 * Store (or refresh) a browser push subscription for a user.
 * Subscriptions are keyed by their unique endpoint; if the same endpoint
 * comes back for a different user (shared device), it is re-pointed.
 */
async function saveSubscription(userId, subscription, userAgent) {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new Error("Invalid push subscription payload.");
  }

  const { endpoint, keys } = subscription;

  const existing = await PushSubscription.findOne({ where: { endpoint } });

  if (existing) {
    existing.user_id = userId;
    existing.p256dh = keys.p256dh;
    existing.auth = keys.auth;
    existing.user_agent = userAgent || existing.user_agent;
    await existing.save();
    return existing;
  }

  return PushSubscription.create({
    user_id: userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent || null,
  });
}

async function removeSubscription(endpoint) {
  if (!endpoint) return 0;
  return PushSubscription.destroy({ where: { endpoint } });
}

/**
 * Send a notification payload to every device a user has subscribed.
 * Dead subscriptions (404/410) are pruned automatically.
 * Returns the number of successful sends.
 */
async function sendToUser(userId, payload) {
  if (!isConfigured() || !userId) return 0;

  const subs = await PushSubscription.findAll({ where: { user_id: userId } });
  if (!subs.length) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        await webpush.sendNotification(pushConfig, body);
        sent += 1;
      } catch (err) {
        const status = err.statusCode;
        if (status === 404 || status === 410) {
          // Subscription expired / unsubscribed — remove it.
          await PushSubscription.destroy({ where: { id: sub.id } });
        } else {
          console.error("Web push send error:", status, err.body || err.message);
        }
      }
    }),
  );

  return sent;
}

module.exports = {
  saveSubscription,
  removeSubscription,
  sendToUser,
};
