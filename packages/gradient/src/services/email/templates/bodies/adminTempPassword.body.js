/**
 * Carries a password in plain text, which is why it is only ever sent to the
 * address that password belongs to. Covers both entry points — a Super Admin
 * creating an account with a password already set, and one resetting an
 * existing account to a temporary password — because the recipient's next step
 * is identical either way: log in, then change it.
 */
export const adminTempPasswordBody = ({
  name,
  email,
  temporaryPassword,
  loginLink,
  isReset = false,
}) => {
  return `
    <h2 style="margin-top:0;">
      ${isReset ? "Your password has been reset" : "Your Gradient admin account is ready"}
    </h2>

    <p>Hello ${name},</p>

    <p>
      ${
        isReset
          ? "A Super Admin has reset your admin panel password. Sign in with the temporary password below."
          : "An admin panel account has been created for you. Sign in with the temporary password below."
      }
    </p>

    <div style="
      background:#f3f4f6;
      border-radius:12px;
      padding:20px 24px;
      margin:24px 0;
      font-size:15px;
    ">
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Email</p>
      <p style="margin:0 0 16px;font-weight:600;">${email}</p>

      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Temporary password</p>
      <p style="margin:0;font-weight:600;font-family:monospace;font-size:17px;letter-spacing:0.5px;">
        ${temporaryPassword}
      </p>
    </div>

    ${
      loginLink
        ? `<div style="text-align:center;margin:30px 0;">
      <a
        href="${loginLink}"
        style="
          background:linear-gradient(180deg,#2EA0FF,#0B6BD6);
          color:#ffffff;
          text-decoration:none;
          padding:14px 28px;
          border-radius:12px;
          display:inline-block;
          font-weight:600;
          font-size:15px;
        "
      >
        Go to Admin Panel
      </a>
    </div>`
        : ""
    }

    <p style="color:#b45309;font-size:14px;font-weight:600;">
      Please change this password as soon as you sign in.
    </p>

    <p style="color:#6b7280;font-size:14px;">
      If you weren't expecting this, contact a Super Admin immediately — someone
      else set this password on your account.
    </p>
  `;
};
