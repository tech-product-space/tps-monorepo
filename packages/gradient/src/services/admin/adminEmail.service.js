import {
  ADMIN_TOKEN_TTL,
  ADMIN_TOKEN_TYPE,
} from "../../config/constants/admin.js";
import {
  BODIES,
  buildEmail,
  EMAIL_PROVIDER_ID,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../email/index.js";
import { generateToken } from "../../util/jwt.util.js";

/**
 * The three admin-onboarding emails, shared by `createAdmin`, `resendInvite`
 * and `resetAdminPassword`.
 *
 * `sendMail` never throws — it resolves `{ success: false }` — so every helper
 * here returns `{ emailed }` alongside the link it minted. Callers surface the
 * link either way: an SES/Graph outage should downgrade the flow to "copy this
 * link yourself", not fail the request and leave a half-created admin behind.
 */

const FROM = EMAIL_PROVIDER_ID.GD_NORP_MAIL;

/** "24h" → "24 hours", so the email copy reads like English. */
const humanizeTtl = (ttl) => {
  const match = /^(\d+)([hmd])$/.exec(ttl);

  if (!match) return ttl;

  const [, amount, unit] = match;
  const noun = { h: "hour", m: "minute", d: "day" }[unit];

  return `${amount} ${noun}${Number(amount) === 1 ? "" : "s"}`;
};

export const buildInviteLink = (admin, passwordResetPageUrl) => {
  const token = generateToken(
    {
      adminId: admin.id,
      email: admin.email,
      type: ADMIN_TOKEN_TYPE.INVITE,
    },
    ADMIN_TOKEN_TTL.INVITE,
  );

  return `${passwordResetPageUrl}?token=${token}`;
};

export const sendAdminInviteEmail = async ({
  admin,
  roleName,
  passwordResetPageUrl,
}) => {
  const inviteLink = buildInviteLink(admin, passwordResetPageUrl);

  const html = buildEmail({
    body: BODIES.ADMIN_INVITE({
      name: admin.name,
      inviteLink,
      roleName,
      expiresIn: humanizeTtl(ADMIN_TOKEN_TTL.INVITE),
    }),
    header: HEADERS.GRADIENT,
    footer: FOOTERS.GRADIENT,
  });

  const result = await sendMail({
    fromEmail: FROM,
    to: admin.email,
    subject: "You've been invited to the Gradient admin panel",
    html,
  });

  return { inviteLink, emailed: result.success };
};

export const sendAdminPasswordResetEmail = async ({ admin, resetPageUrl }) => {
  const token = generateToken(
    {
      adminId: admin.id,
      email: admin.email,
      type: ADMIN_TOKEN_TYPE.PASSWORD_RESET,
    },
    ADMIN_TOKEN_TTL.PASSWORD_RESET,
  );

  const resetLink = `${resetPageUrl}?token=${token}`;

  const html = buildEmail({
    body: BODIES.ADMIN_PASSWORD_RESET({
      name: admin.name,
      resetLink,
      expiresIn: humanizeTtl(ADMIN_TOKEN_TTL.PASSWORD_RESET),
    }),
    header: HEADERS.GRADIENT,
    footer: FOOTERS.GRADIENT,
  });

  const result = await sendMail({
    fromEmail: FROM,
    to: admin.email,
    subject: "Reset your Gradient admin password",
    html,
  });

  return { resetLink, emailed: result.success };
};

/**
 * The password is generated in the browser and shown in the dialog, so it is
 * never returned from the API — this only puts a copy in the admin's inbox.
 */
export const sendAdminTempPasswordEmail = async ({
  admin,
  temporaryPassword,
  loginUrl,
  isReset = false,
}) => {
  const html = buildEmail({
    body: BODIES.ADMIN_TEMP_PASSWORD({
      name: admin.name,
      email: admin.email,
      temporaryPassword,
      loginLink: loginUrl,
      isReset,
    }),
    header: HEADERS.GRADIENT,
    footer: FOOTERS.GRADIENT,
  });

  const result = await sendMail({
    fromEmail: FROM,
    to: admin.email,
    subject: isReset
      ? "Your Gradient admin password has been reset"
      : "Your Gradient admin account is ready",
    html,
  });

  return { emailed: result.success };
};
