#!/usr/bin/env node
"use strict";

/**
 * Change the OWNER of an enrollment (lead_courses.owner_agent_id).
 *
 * owner_agent_id is a snapshot of the lead owner taken at enroll time and is
 * deliberately never touched by later lead reassignment — it is what the
 * enrollment list's Owner column, the enrollment/invoice/payment data scopes
 * and the dashboard's agent credit all read. So moving a sale from one agent to
 * another means rewriting this column, which is what this script does.
 *
 * What it does NOT touch, on purpose:
 *   - leads.agent_id — who owns the LEAD today. Changing enrollment credit and
 *     changing pipeline ownership are different decisions. (--cascade-leads
 *     opts into doing both.)
 *   - created_by — who physically recorded the enrollment. That is history.
 *   - payments.created_by — the /payments list is scoped by recorder, not
 *     owner, so payment visibility does not follow the owner. Expected.
 *
 * Every change writes an Audit activity on the student's profile, so the move
 * shows up on the lead timeline afterwards.
 *
 * Usage:
 *   # 1. find the enrollment(s)
 *   node scripts/change-enrollment-owner.js --list 9876543210
 *   node scripts/change-enrollment-owner.js --list "Jane Doe"
 *
 *   # 2. preview the change (DRY RUN — nothing is written without --yes)
 *   node scripts/change-enrollment-owner.js <enrollment-uuid> --to agent@acme.com
 *
 *   # 3. commit it
 *   node scripts/change-enrollment-owner.js <enrollment-uuid> --to agent@acme.com --yes
 *
 * Targets (pick one):
 *   <enrollment-uuid> [...]      one or more enrollments (lead_courses.id)
 *   --student <phone|email|uuid> every enrollment of that person
 *     [--course <course_id>]     ...narrowed to one product
 *     [--include-dropped]        ...including dropped ones (default: active only)
 *
 * New owner (required unless --list):
 *   --to <email | name | uuid>   must be an active Agent or Manager
 *   --to-none                    clear the owner (falls into "Unassigned / Other")
 *
 * Flags:
 *   --yes                 actually write. Without it the script only prints the plan.
 *   --cascade-leads       also reassign every lead under the student's profile to
 *                         the new owner (what the app does on enroll). Off by default.
 *   --actor <email|uuid>  who to record as the actor on the audit activity.
 *                         Defaults to the new owner, else the oldest Superadmin.
 *   --reason "..."        free text stored on the audit activity.
 */

const {
  sequelize,
  LeadCourse,
  LeadProfile,
  User,
  Lead,
  Activity,
} = require("../src/models");
const { Op } = require("sequelize");
const { ROLES, isAssignableRole } = require("../src/config/constants/roles");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- arg parsing

const VALUE_FLAGS = ["to", "student", "course", "actor", "reason", "list"];

function parseArgs(argv) {
  const out = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out.positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (VALUE_FLAGS.includes(key)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`--${key} needs a value`);
      }
      out.flags[key] = next;
      i += 1;
    } else {
      out.flags[key] = true;
    }
  }
  return out;
}

// ------------------------------------------------------------------ resolvers

async function resolveUser(identifier) {
  const where = UUID_RE.test(identifier)
    ? { id: identifier }
    : {
        [Op.or]: [
          sequelize.where(
            sequelize.fn("lower", sequelize.col("email")),
            identifier.toLowerCase(),
          ),
          sequelize.where(
            sequelize.fn("lower", sequelize.col("name")),
            identifier.toLowerCase(),
          ),
        ],
      };

  const users = await User.findAll({
    where,
    attributes: ["id", "name", "email", "role", "is_active"],
  });

  if (users.length === 0) throw new Error(`No user matches "${identifier}"`);
  if (users.length > 1) {
    const list = users
      .map((u) => `  ${u.id}  ${u.name} <${u.email}>`)
      .join("\n");
    throw new Error(
      `"${identifier}" matches ${users.length} users — pass the UUID instead:\n${list}`,
    );
  }
  return users[0];
}

// Phone matching is digits-only, the same rule lead dedup uses.
async function resolveProfiles(identifier) {
  if (UUID_RE.test(identifier)) {
    const profile = await LeadProfile.findByPk(identifier);
    return profile ? [profile] : [];
  }

  const or = [
    sequelize.where(
      sequelize.fn("lower", sequelize.col("email")),
      identifier.toLowerCase(),
    ),
    sequelize.where(
      sequelize.fn("lower", sequelize.col("name")),
      identifier.toLowerCase(),
    ),
  ];

  const digits = identifier.replace(/\D/g, "");
  if (digits.length >= 6) {
    or.push(
      sequelize.where(
        sequelize.fn("regexp_replace", sequelize.col("phone"), "\\D", "", "g"),
        { [Op.like]: `%${digits}` },
      ),
    );
  }

  return LeadProfile.findAll({ where: { [Op.or]: or }, limit: 50 });
}

async function resolveActor(flags, newOwner) {
  if (flags.actor) return resolveUser(flags.actor);
  if (newOwner) return newOwner;

  const admin = await User.findOne({
    where: { role: ROLES.SUPERADMIN, is_active: true },
    order: [["created_at", "ASC"]],
    attributes: ["id", "name", "email", "role", "is_active"],
  });
  if (!admin) {
    throw new Error("No Superadmin found to attribute the change to — pass --actor");
  }
  return admin;
}

// ------------------------------------------------------------------ selection

const ENROLLMENT_INCLUDE = [
  {
    model: LeadProfile,
    as: "LeadProfile",
    attributes: ["id", "name", "phone", "email"],
  },
  {
    model: User,
    as: "Owner",
    attributes: ["id", "name", "email", "role", "is_active"],
  },
  { model: User, as: "Creator", attributes: ["id", "name", "email"] },
];

async function selectEnrollments(args) {
  const { positional, flags } = args;

  if (positional.length > 0) {
    const bad = positional.filter((p) => !UUID_RE.test(p));
    if (bad.length) throw new Error(`Not an enrollment UUID: ${bad.join(", ")}`);

    const rows = await LeadCourse.findAll({
      where: { id: { [Op.in]: positional } },
      include: ENROLLMENT_INCLUDE,
    });
    const missing = positional.filter((id) => !rows.some((r) => r.id === id));
    if (missing.length) {
      throw new Error(`No enrollment with id: ${missing.join(", ")}`);
    }
    return rows;
  }

  const studentRef = flags.student || flags.list;
  if (!studentRef) {
    throw new Error(
      "Give an enrollment UUID, or --student <phone|email|name|uuid>, or --list <...>",
    );
  }

  const profiles = await resolveProfiles(String(studentRef));
  if (profiles.length === 0) throw new Error(`No student matches "${studentRef}"`);
  if (profiles.length > 1 && !flags.list) {
    const list = profiles
      .map((p) => `  ${p.id}  ${p.name} | ${p.phone || "-"} | ${p.email || "-"}`)
      .join("\n");
    throw new Error(
      `"${studentRef}" matches ${profiles.length} people — pass the profile UUID:\n${list}`,
    );
  }

  const where = { lead_profile_id: { [Op.in]: profiles.map((p) => p.id) } };
  if (!flags["include-dropped"]) where.status = "active";
  if (flags.course) where.course_id = flags.course;

  return LeadCourse.findAll({
    where,
    include: ENROLLMENT_INCLUDE,
    order: [["created_at", "DESC"]],
  });
}

// -------------------------------------------------------------------- display

function describe(enrollment) {
  const profile = enrollment.LeadProfile;
  const owner = enrollment.Owner;
  // The model is `underscored`, so the timestamp attribute is `createdAt`
  // while the column is created_at — read both so either spelling works.
  const createdAt = enrollment.createdAt || enrollment.get("created_at");
  const enrolledOn = createdAt
    ? new Date(createdAt).toISOString().slice(0, 10)
    : "?";
  const badges = [
    enrollment.status !== "active" ? String(enrollment.status).toUpperCase() : null,
    enrollment.is_deferred ? "deferred" : null,
    enrollment.is_reenrollment ? "re-enrollment" : null,
  ].filter(Boolean);

  return [
    `  id        ${enrollment.id}`,
    `  student   ${profile?.name || "?"} | ${profile?.phone || "-"} | ${profile?.email || "-"}`,
    `  program   ${enrollment.program_name} (${enrollment.course_id})${
      enrollment.cohort_name ? ` — ${enrollment.cohort_name}` : ""
    }`,
    `  fee       ${enrollment.currency} ${enrollment.final_fee}`,
    `  enrolled  ${enrolledOn}${
      badges.length ? `  [${badges.join(", ")}]` : ""
    }`,
    `  owner     ${owner ? `${owner.name} <${owner.email}>` : "— unassigned —"}`,
    `  recorded  ${enrollment.Creator ? enrollment.Creator.name : "?"}`,
  ].join("\n");
}

// ----------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { flags } = args;

  const enrollments = await selectEnrollments(args);

  if (flags.list) {
    console.log(`${enrollments.length} enrollment(s):\n`);
    enrollments.forEach((e) => console.log(`${describe(e)}\n`));
    return;
  }

  if (enrollments.length === 0) {
    console.log("No enrollments matched — nothing to do.");
    return;
  }

  // --- resolve the new owner ------------------------------------------------
  let newOwner = null;
  if (flags["to-none"]) {
    newOwner = null;
  } else if (flags.to) {
    newOwner = await resolveUser(flags.to);
    // Superadmins and Program Managers are supervisory and are never lead
    // owners; crediting a sale to one puts it outside every agent-scoped view.
    if (!isAssignableRole(newOwner.role)) {
      throw new Error(
        `${newOwner.name} is a ${newOwner.role} — only an Agent or Manager can own an enrollment.`,
      );
    }
    if (!newOwner.is_active) {
      throw new Error(`${newOwner.name} is deactivated — reactivate them first.`);
    }
  } else {
    throw new Error("Pass --to <email|name|uuid>, or --to-none to clear the owner.");
  }

  const actor = await resolveActor(flags, newOwner);
  const commit = Boolean(flags.yes);

  console.log(
    `${commit ? "APPLYING" : "DRY RUN"} — new owner: ${
      newOwner
        ? `${newOwner.name} <${newOwner.email}> (${newOwner.role})`
        : "— unassigned —"
    }`,
  );
  console.log(`Audit actor: ${actor.name} <${actor.email}>\n`);

  const newOwnerId = newOwner ? newOwner.id : null;
  const targets = enrollments.filter(
    (e) => (e.owner_agent_id || null) !== newOwnerId,
  );
  const skipped = enrollments.length - targets.length;

  enrollments.forEach((e) => {
    const noop = !targets.includes(e);
    console.log(
      `${describe(e)}\n  -> ${noop ? "already owned by them, skipping" : "WILL CHANGE"}\n`,
    );
  });

  if (targets.length === 0) {
    console.log(`Nothing to change (${skipped} already correct).`);
    return;
  }

  if (!commit) {
    console.log(
      `Would change ${targets.length} enrollment(s)${
        skipped ? `, skip ${skipped}` : ""
      }. Re-run with --yes to apply.`,
    );
    return;
  }

  // --- write ----------------------------------------------------------------
  await sequelize.transaction(async (transaction) => {
    for (const enrollment of targets) {
      const previous = enrollment.Owner;

      await enrollment.update({ owner_agent_id: newOwnerId }, { transaction });

      await Activity.create(
        {
          lead_id: null,
          profile_id: enrollment.lead_profile_id,
          actor_id: actor.id,
          type: "Audit",
          title: `Enrollment owner changed on ${enrollment.program_name}`,
          details:
            `Owner of the ${enrollment.program_name} enrollment moved from ` +
            `${previous ? previous.name : "Unassigned"} to ` +
            `${newOwner ? newOwner.name : "Unassigned"}` +
            `${flags.reason ? `. Reason: ${flags.reason}` : ""}` +
            ` (via change-enrollment-owner script).`,
          metadata: {
            action: "enrollment_owner_changed",
            lead_course_id: enrollment.id,
            course_id: enrollment.course_id,
            program_name: enrollment.program_name,
            old: {
              owner_agent_id: previous ? previous.id : null,
              owner_name: previous ? previous.name : null,
            },
            new: {
              owner_agent_id: newOwnerId,
              owner_name: newOwner ? newOwner.name : null,
            },
            reason: flags.reason || null,
            source: "script",
          },
        },
        { transaction },
      );

      console.log(
        `Changed ${enrollment.id}: ${previous ? previous.name : "Unassigned"} -> ${
          newOwner ? newOwner.name : "Unassigned"
        }`,
      );
    }

    // Opt-in: bring pipeline ownership along with the sale.
    if (flags["cascade-leads"] && newOwner) {
      const profileIds = [...new Set(targets.map((e) => e.lead_profile_id))];
      const leads = await Lead.findAll({
        where: {
          profile_id: { [Op.in]: profileIds },
          is_deleted: false,
          [Op.or]: [
            { agent_id: null },
            { agent_id: { [Op.ne]: newOwner.id } },
          ],
        },
        transaction,
      });

      for (const lead of leads) {
        const oldAgentId = lead.agent_id;
        await lead.update({ agent_id: newOwner.id }, { transaction });
        await Activity.create(
          {
            lead_id: lead.id,
            profile_id: lead.profile_id,
            actor_id: actor.id,
            type: "Assignment",
            title: `Lead reassigned to ${newOwner.name}`,
            details:
              "Followed an enrollment owner change (via change-enrollment-owner script).",
            metadata: {
              action: "lead_reassigned",
              old: { agent_id: oldAgentId },
              new: { agent_id: newOwner.id },
              reason: flags.reason || null,
              source: "script",
            },
          },
          { transaction },
        );
      }
      console.log(`Cascaded ${leads.length} lead(s) to ${newOwner.name}.`);
    }
  });

  console.log(
    `\nDone. ${targets.length} enrollment(s) changed${
      skipped ? `, ${skipped} already correct` : ""
    }.`,
  );
}

main()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error("Error:", err.message);
    await sequelize.close();
    process.exit(1);
  });
