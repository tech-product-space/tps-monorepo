const { Op } = require("sequelize");
const { User } = require("../models");
const { ROLES } = require("../config/constants/roles");
const { sendToUser } = require("./push.service");

/**
 * Web push for the manual-payment verification loop.
 *
 * Every function here is fire-and-forget: a payment must never fail to record,
 * verify or reject because a browser subscription went stale. Callers do not
 * await these, and nothing inside them is allowed to throw.
 */

/** Active users who can approve a payment. */
async function getVerifierIds(excludeUserId) {
  const rows = await User.findAll({
    where: {
      role: { [Op.in]: [ROLES.SUPERADMIN, ROLES.PROGRAM_MANAGER] },
      is_active: true,
    },
    attributes: ["id"],
    raw: true,
  });

  const exclude = excludeUserId ? String(excludeUserId).toLowerCase() : null;
  return rows
    .map((r) => String(r.id).toLowerCase())
    .filter((id) => id !== exclude);
}

async function push(userId, payload) {
  try {
    await sendToUser(userId, payload);
  } catch (err) {
    console.error("Payment verification push error:", err.message);
  }
}

/**
 * A payment was recorded and is waiting. Notifies every verifier except the
 * person who recorded it — a verifier recording their own collection already
 * knows it's there.
 */
function notifyRecorded({ payment, recorderId, money, programName }) {
  setImmediate(async () => {
    try {
      const [recorder, verifierIds] = await Promise.all([
        User.findByPk(recorderId, { attributes: ["name"], raw: true }),
        getVerifierIds(recorderId),
      ]);

      if (!verifierIds.length) return;

      const who = recorder?.name || "Someone";
      const payload = {
        title: "Payment needs verification",
        body: `${who} recorded ${money}${programName ? ` for ${programName}` : ""}. It won't count until approved.`,
        url: "/payments/verifications",
        tag: `payment-verify-${payment.id}`,
      };

      await Promise.all(verifierIds.map((id) => push(id, payload)));
    } catch (err) {
      console.error("notifyRecorded failed:", err.message);
    }
  });
}

/**
 * A payment was approved. Notifies the recorder, unless they approved it
 * themselves.
 */
function notifyVerified({ payment, verifierId, money, programName }) {
  setImmediate(async () => {
    try {
      const recorderId = String(payment.created_by).toLowerCase();
      if (recorderId === String(verifierId).toLowerCase()) return;

      await push(recorderId, {
        title: "Payment verified",
        body: `Your ${money} payment${programName ? ` for ${programName}` : ""} has been verified and now counts towards collections.`,
        url: "/enrollments",
        tag: `payment-verified-${payment.id}`,
      });
    } catch (err) {
      console.error("notifyVerified failed:", err.message);
    }
  });
}

/**
 * A payment was rejected. Always notifies the recorder — including when they
 * rejected their own, since that is usually a correction they want a record of.
 */
function notifyRejected({ payment, verifierId, money, reason }) {
  setImmediate(async () => {
    try {
      const recorderId = String(payment.created_by).toLowerCase();
      if (recorderId === String(verifierId).toLowerCase()) return;

      await push(recorderId, {
        title: "Payment rejected",
        body: `Your ${money} payment was rejected: ${reason}`,
        url: "/enrollments",
        tag: `payment-rejected-${payment.id}`,
      });
    } catch (err) {
      console.error("notifyRejected failed:", err.message);
    }
  });
}

/**
 * The recorder withdrew a payment that was still waiting. Notifies the
 * verifiers — the mirror of notifyRecorded, and for the same reason: they were
 * told to go look at this money, so they should be told when it is gone. Never
 * notifies the recorder, who just performed the action.
 */
function notifyCancelled({ payment, actorId, money, programName, reason }) {
  setImmediate(async () => {
    try {
      const [actor, verifierIds] = await Promise.all([
        User.findByPk(actorId, { attributes: ["name"], raw: true }),
        getVerifierIds(actorId),
      ]);

      if (!verifierIds.length) return;

      const who = actor?.name || "Someone";
      const payload = {
        title: "Payment withdrawn",
        body: `${who} cancelled their ${money} payment${
          programName ? ` for ${programName}` : ""
        } before it was verified.${reason ? ` Reason: ${reason}` : ""}`,
        url: "/payments/verifications",
        // Same tag as the "needs verification" push, so the withdrawal REPLACES
        // the request in the tray instead of stacking a second card about a
        // payment that no longer needs anyone's attention.
        tag: `payment-verify-${payment.id}`,
      };

      await Promise.all(verifierIds.map((id) => push(id, payload)));
    } catch (err) {
      console.error("notifyCancelled failed:", err.message);
    }
  });
}

module.exports = {
  getVerifierIds,
  notifyRecorded,
  notifyVerified,
  notifyRejected,
  notifyCancelled,
};
