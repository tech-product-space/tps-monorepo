/**
 * The link half of "Reset password". Distinct from BODIES.FORGOT_PASSWORD,
 * which is the website users' self-service flow — this one is initiated *by a
 * Super Admin*, so the copy has to explain why an unrequested email arrived.
 */
export const adminPasswordResetBody = ({ name, resetLink, expiresIn }) => {
  return `
    <h2 style="margin-top:0;">Reset your admin password</h2>

    <p>Hello ${name},</p>

    <p>
      A Super Admin has started a password reset for your Gradient admin
      account. Click below to choose a new password.
    </p>

    <div style="text-align:center;margin:30px 0;">
      <a
        href="${resetLink}"
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
        Choose a New Password
      </a>
    </div>

    <p style="color:#6b7280;font-size:14px;">
      This link expires in ${expiresIn}. Your current password keeps working
      until you set a new one.
    </p>

    <p style="color:#6b7280;font-size:14px;">
      If you weren't expecting this, contact a Super Admin.
    </p>
  `;
};
