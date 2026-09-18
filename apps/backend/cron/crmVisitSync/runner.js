const { Op } = require("sequelize");
const { VisitorNotificationHistory } = require("../../models");
const { sendVisitToCRM, isEnabled } = require("../../service/crm/websiteVisit");

/**
 * The safety net under the live send.
 *
 * The live send happens inside a visitor's page request and is deliberately
 * fire-and-forget, so a CRM that is restarting, deploying or briefly unreachable
 * loses that visit and nobody would ever know. This re-offers everything from the
 * last few hours.
 *
 * There is no "already sent" flag, on purpose. The CRM rejects any visit whose
 * record id it already holds — a single indexed lookup — so re-offering is cheap
 * and, more importantly, *correct by construction*: correctness does not depend
 * on a flag on this side staying in step with what the CRM actually stored. The
 * cost is re-sending a few hundred rows an hour, which is nothing.
 *
 * The window is wider than the interval so a run that fails entirely is covered
 * by the next one.
 */
const LOOKBACK_HOURS = 3;

async function runCrmVisitSync() {
  if (!isEnabled()) return;

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  try {
    const entries = await VisitorNotificationHistory.findAll({
      where: { timestamp: { [Op.gte]: since } },
      order: [["timestamp", "ASC"]],
    });

    if (!entries.length) return;

    let sent = 0;
    let failed = 0;

    // Sequential rather than parallel: this is a background catch-up with no
    // deadline, and it must never be the reason the CRM falls over.
    for (const entry of entries) {
      try {
        await sendVisitToCRM(entry);
        sent += 1;
      } catch (err) {
        failed += 1;
        console.error(
          `CRM visit catch-up failed (notification ${entry.id}):`,
          err.response?.status || err.message,
        );
      }
    }

    console.log(
      `🔁 CRM visit catch-up: offered ${entries.length}, sent ${sent}, failed ${failed}`,
    );
  } catch (err) {
    console.error("CRM visit catch-up run failed:", err.message);
  }
}

module.exports = { runCrmVisitSync };
