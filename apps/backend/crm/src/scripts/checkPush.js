// Dev helper: inspect push subscriptions + users (read-only).
require("dotenv").config();
const { PushSubscription, User, sequelize } = require("../models");

(async () => {
  const subs = await PushSubscription.findAll({
    attributes: ["user_id", "user_agent", "created_at"],
    order: [["created_at", "DESC"]],
  });

  console.log(`\n=== push_subscriptions (${subs.length}) ===`);
  for (const s of subs) {
    console.log(
      `user_id=${s.user_id}  created=${s.created_at?.toISOString?.() || s.created_at}  ua=${(s.user_agent || "").slice(0, 60)}`,
    );
  }
  if (!subs.length) console.log("(none)");

  const users = await User.findAll({
    attributes: ["id", "name", "email", "role", "is_active"],
    order: [["role", "ASC"]],
  });

  console.log(`\n=== users (${users.length}) ===`);
  for (const u of users) {
    console.log(
      `${u.id}  ${u.role.padEnd(10)} active=${u.is_active}  ${u.name} <${u.email}>`,
    );
  }

  await sequelize.close();
  process.exit(0);
})();
