const psEnv = require("@ps/env/tps");
// Promote a company (staff) user to superadmin from the server, by email.
// Only touches the `company` table — platform users (`users`) are untouched.
//
// Run from tps-next-backend with the same NODE_ENV the API uses:
//
//   NODE_ENV=development node scripts/makeSuperadmin.js someone@theproductspace.co.in
//   NODE_ENV=production  node scripts/makeSuperadmin.js someone@example.com
//
// Options:
//   --role=admin|superadmin|creator|sales   set a role other than superadmin (e.g. to demote)
//   --password[=Secret123]  set/reset the login password for the account. Pass
//        the flag with no value to be prompted for it (keeps it out of shell
//        history). Setting a password clears any pending invite token.
//   --keep-role  don't touch the role — use with --password for a pure password reset:
//        node scripts/makeSuperadmin.js someone@example.com --password --keep-role
//   --create --name="Full Name" [--password=Secret123]
//        create the staff account if the email doesn't exist yet. Without
//        --password the account is created password-less with an invite token;
//        the printed invite link lets them set their own password.
//   --list  print all staff accounts and exit
//
// Windows PowerShell has no inline env prefix — use:
//   $env:NODE_ENV="development"; node scripts/makeSuperadmin.js someone@example.com
"use strict";

const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const db = require("../models");

const { company, Sequelize } = db;
const { fn, col, where } = Sequelize;

const VALID_ROLES = ["superadmin", "admin", "creator", "sales"];

// --key=value / --flag
const parseArgs = (argv) => {
  const flags = {};
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const [key, ...rest] = arg.slice(2).split("=");
      flags[key] = rest.length ? rest.join("=") : true;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
};

const MIN_PASSWORD_LENGTH = 8;

// Prompt for a password without echoing it, so it never lands in shell history.
const promptPassword = (label) =>
  new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      return reject(
        new Error("--password needs a value when stdin is not a terminal (use --password=Secret123)")
      );
    }
    const readline = require("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Swallow the echoed characters while the prompt is open.
    let muted = false;
    const originalWrite = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (str) => (muted ? process.stdout.write("") : originalWrite(str));
    rl.question(`${label}: `, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });

// Returns a bcrypt hash, or null when no password was requested.
const resolvePassword = async (flag) => {
  if (flag === undefined) return null;

  let plain = typeof flag === "string" ? flag : await promptPassword("New password");
  if (typeof flag !== "string") {
    const confirm = await promptPassword("Confirm password");
    if (plain !== confirm) throw new Error("Passwords did not match.");
  }

  plain = plain.trim();
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return bcrypt.hash(plain, 10);
};

const findByEmail = (email) =>
  company.findOne({
    where: where(fn("lower", col("email")), email.trim().toLowerCase()),
  });

const printUser = (u) =>
  console.log(
    `  #${u.id}  ${u.email}  ${u.role || "(no role)"}  ${u.name || ""}${
      u.password ? "" : "  [no password set]"
    }`
  );

(async () => {
  try {
    const { flags, positional } = parseArgs(process.argv.slice(2));

    if (flags.list) {
      const users = await company.findAll({ order: [["id", "ASC"]] });
      console.log(`Staff accounts (${users.length}):`);
      users.forEach(printUser);
      process.exit(0);
    }

    const email = (positional[0] || flags.email || "").trim();
    if (!email || !email.includes("@")) {
      console.error(
        "Usage: node scripts/makeSuperadmin.js <email> [--role=superadmin] [--password[=Secret123]] [--keep-role] [--create --name=\"Full Name\"] [--list]"
      );
      process.exit(1);
    }

    const keepRole = Boolean(flags["keep-role"]);
    const role = typeof flags.role === "string" ? flags.role.trim() : "superadmin";
    if (keepRole && typeof flags.role === "string") {
      console.error("--keep-role and --role are mutually exclusive.");
      process.exit(1);
    }
    if (!VALID_ROLES.includes(role)) {
      console.error(`Invalid role "${role}". Valid roles: ${VALID_ROLES.join(", ")}`);
      process.exit(1);
    }

    // Hash (and prompt for) the password before touching the DB, so a typo or a
    // mismatched confirmation aborts without a half-applied change.
    const hashedPassword = await resolvePassword(flags.password);

    await db.sequelize.authenticate();

    let user = await findByEmail(email);

    if (!user) {
      if (!flags.create) {
        console.error(
          `No company user found with email "${email}".\n` +
            `This script only promotes existing staff accounts. To create one, re-run with:\n` +
            `  node scripts/makeSuperadmin.js ${email} --create --name="Full Name"`
        );
        process.exit(1);
      }

      const name = typeof flags.name === "string" ? flags.name : null;
      if (!name) {
        console.error('--create requires --name="Full Name"');
        process.exit(1);
      }

      const inviteToken = hashedPassword ? null : uuidv4();

      user = await company.create({
        name,
        email: email.toLowerCase(),
        role,
        password: hashedPassword,
        inviteToken,
      });

      console.log(`Created staff account #${user.id} with role "${role}".`);
      if (inviteToken) {
        const base = psEnv.ADMIN_FRONTEND_URL || "http://localhost:4200";
        console.log(`Set-password link: ${base}/auth/invite?token=${inviteToken}`);
      }
      printUser(user);
      process.exit(0);
    }

    const previousRole = user.role;
    const changes = [];

    if (keepRole) {
      // pure password reset — leave the role alone
    } else if (previousRole === role) {
      console.log(`Role unchanged — ${user.email} is already "${role}".`);
    } else {
      user.role = role;
      changes.push(`role "${previousRole || "(none)"}" -> "${role}"`);
    }

    if (hashedPassword) {
      user.password = hashedPassword;
      // A fresh password invalidates any outstanding invite link.
      if (user.inviteToken) user.inviteToken = null;
      changes.push("password set");
    }

    if (!changes.length) {
      console.log("Nothing to do.");
      printUser(user);
      process.exit(0);
    }

    await user.save();

    console.log(`Updated ${user.email}: ${changes.join(", ")}.`);
    printUser(user);
    if (!user.password) {
      console.log(
        "Note: this account has no password yet — they must use their invite link or Google login."
      );
    }
    if (changes.some((c) => c.startsWith("role"))) {
      console.log(
        "They need to log out and back in for the new role to take effect (role is baked into the JWT)."
      );
    }
    process.exit(0);
  } catch (e) {
    console.error("Failed:", e.message);
    process.exit(1);
  }
})();
