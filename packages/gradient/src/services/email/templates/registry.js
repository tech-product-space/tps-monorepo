import { adminInviteBody } from "./bodies/adminInvite.body.js";
import { adminPasswordResetBody } from "./bodies/adminPasswordReset.body.js";
import { adminTempPasswordBody } from "./bodies/adminTempPassword.body.js";
import customBody from "./bodies/custom.body.js";
import { forgotPasswordBody } from "./bodies/forgotPassword.body.js";
import { metaTokenExpiredBody } from "./bodies/metaTokenExpired.body.js";
import { gradientFooter } from "./footers/gradient.footer.js";
import { gradientMarketingFooter } from "./footers/gradientMarketing.footer.js";
import { gradientHeader } from "./headers/gradient.header.js";

export const HEADERS = {
  GRADIENT: gradientHeader,
};

export const BODIES = {
  FORGOT_PASSWORD: forgotPasswordBody,
  CUSTOM: customBody,
  ADMIN_INVITE: adminInviteBody,
  ADMIN_TEMP_PASSWORD: adminTempPasswordBody,
  ADMIN_PASSWORD_RESET: adminPasswordResetBody,
  /** Operational alert to META_ALERT_EMAIL, not to a lead or an admin user. */
  META_TOKEN_EXPIRED: metaTokenExpiredBody,
};

export const FOOTERS = {
  /** Transactional mail. Currently renders nothing visible. */
  GRADIENT: gradientFooter,
  /**
   * Marketing campaigns only, and mandatory for all of them.
   * Needs `footerProps: { unsubscribeUrl }` on the `buildEmail` call.
   */
  GRADIENT_MARKETING: gradientMarketingFooter,
};
