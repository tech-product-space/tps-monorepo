const db = require("../../models");
const {
  PRIORITY,
  ACTIVE_COHORT_STATUSES,
} = require("../../constants/support");

const ACTIVE_SET = new Set(ACTIVE_COHORT_STATUSES.map((s) => s.toLowerCase()));

const { CohortMember } = db;
const sequelize = db.sequelize;

// Concurrency-safe ticket number from the Postgres sequence: TPS-1000+.
async function nextTicketNumber(transaction) {
  const [rows] = await sequelize.query(
    "SELECT nextval('support_tickets_seq') AS n",
    { transaction }
  );
  const n = rows && rows[0] ? rows[0].n : null;
  return `TPS-${n}`;
}

// Resolve cohort membership for a logged-in user by their id. The user's
// email is the identity key; since they're authenticated we already have
// their user_id, which maps to the same person. Status is compared
// case-insensitively because the DB stores values like "Active"/"Inactive".
async function resolveCohort(userId, transaction) {
  const members = await CohortMember.findAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
    transaction,
  });

  const active = members.find((m) =>
    ACTIVE_SET.has(String(m.status || "").toLowerCase())
  );

  return {
    isCohortMember: !!active,
    cohortMemberId: active ? active.id : null,
  };
}

// Cohort members get HIGH priority by default; everyone else NORMAL.
// Admins can override afterwards to any of low/normal/medium/high.
function computePriority(isCohortMember) {
  return isCohortMember ? PRIORITY.HIGH : PRIORITY.NORMAL;
}

module.exports = {
  nextTicketNumber,
  resolveCohort,
  computePriority,
};
