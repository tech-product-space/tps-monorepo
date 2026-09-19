import psEnv from "@ps/env/gradient";
import dotenv from "dotenv";
dotenv.config();

export const EMAIL_PROVIDER_ID = Object.freeze({
    PS_INFO_MAIL: "info@thegradient.co.in",
    GD_NORP_MAIL: "noreply@gradientlearnings.org",
    GD_INFO_MAIL: "info@gradientlearnings.org",
})

/**
 * The sender every transactional email uses unless it pins its own.
 *
 * Event guest mail (waitlisted / approved / declined / registered), course mail
 * (enrollment acknowledgement, brochure / curriculum download), password
 * resets, resource-lead mail and both template test sends all resolve to this,
 * so changing DEFAULT_SENDER_EMAIL in .env moves all of them at once — no code
 * change. It must be one of the addresses in EMAIL_ACCOUNTS; anything else has
 * no transport and `initEmailProviders` logs an error at boot.
 *
 * Deliberately NOT used by: certificates, admin mail and project download mail
 * (pinned to the noreply identity) and campaigns / reminders / workflows
 * (sender chosen per row in the panel).
 */
export const DEFAULT_SENDER_EMAIL =
    psEnv.DEFAULT_SENDER_EMAIL || EMAIL_PROVIDER_ID.GD_INFO_MAIL;

/**
 * Display name on the same mail. Honoured by SES only — Graph sends as the
 * mailbox identity and ignores it.
 */
export const DEFAULT_SENDER_NAME =
    psEnv.DEFAULT_SENDER_NAME || "Gradient Learnings";
