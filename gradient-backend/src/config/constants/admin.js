export const ADMIN_ROLES = {
    SUPER_ADMIN: "Super Admin",
}

export const ADMIN_INVITE_STATUS = {
    PENDING: "pending",
    ACCEPTED: "accepted",
}

/**
 * `type` claim on the short-lived tokens the panel mints for password flows.
 * `setPassword` branches on this: an INVITE token is only good while the admin
 * is still pending, a PASSWORD_RESET token works for an admin who already
 * onboarded. Distinct from the website users' "password_reset" so an admin
 * token can never be replayed against `/auth`, and vice versa.
 */
export const ADMIN_TOKEN_TYPE = {
    INVITE: "invite",
    PASSWORD_RESET: "admin_password_reset",
}

/**
 * The invite was 1h and shown once in a dialog — if the Super Admin closed it
 * the link was unrecoverable and the row was stuck pending forever. It is
 * emailed now and resendable, so a day is the humane window.
 */
export const ADMIN_TOKEN_TTL = {
    INVITE: "24h",
    PASSWORD_RESET: "1h",
}

/** Mirrored in the panel's set-password form and temp-password fields. */
export const ADMIN_PASSWORD_MIN_LENGTH = 8;
