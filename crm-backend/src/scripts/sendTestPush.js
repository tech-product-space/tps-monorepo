// Dev helper: send a push to a user on demand (bypasses cron + DB).
//
// Usage:
//   node src/scripts/sendTestPush.js <userId> [kind] [name] [product]
//
// kinds:
//   test       (default) generic "push works" message
//   t30        ⏰ Mentor call in 30 min
//   t5         ⏰ Mentor call in 5 min
//   mentor     ⏰ Mentor call now
//   followup   🔔 Follow-up now
//   unassigned 🔔 Follow-up now … · Unassigned
//
// Examples:
//   node src/scripts/sendTestPush.js 0000...01
//   node src/scripts/sendTestPush.js 0000...01 t30 "Priya Sharma" "PM Fellowship"
require("dotenv").config();
const { sendToUser } = require("../services/push.service");
const { buildPayload } = require("../cron/followup/runner");

const PRESETS = {
  // kind, isMentor, isUnassigned
  test: null,
  t30: ["t30", true, false],
  t5: ["t5", true, false],
  mentor: ["ontime", true, false],
  followup: ["ontime", false, false],
  unassigned: ["ontime", false, true],
};

(async () => {
  const [userId, kind = "test", name = "Test Lead", product = "PM Fellowship"] =
    process.argv.slice(2);

  if (!userId) {
    console.error(
      "Usage: node src/scripts/sendTestPush.js <userId> [kind] [name] [product]",
    );
    console.error("kinds:", Object.keys(PRESETS).join(", "));
    process.exit(1);
  }

  let payload;
  if (kind === "test" || !PRESETS[kind]) {
    payload = {
      title: "✅ Test push",
      body: "If you can read this, push works.",
      url: "/reminders",
      tag: "test",
    };
  } else {
    const [k, isMentor, isUnassigned] = PRESETS[kind];
    payload = buildPayload(k, isMentor, name, product, isUnassigned);
  }

  const count = await sendToUser(userId, payload);
  console.log(`[${kind}] "${payload.title}" → sent to ${count} device(s)`);
  process.exit(0);
})();
