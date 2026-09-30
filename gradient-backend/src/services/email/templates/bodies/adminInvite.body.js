/**
 * Sent when a Super Admin creates an admin without a temporary password, and
 * again on every "Resend invite". `expiresIn` is passed in rather than hardcoded
 * so the copy cannot drift from ADMIN_TOKEN_TTL.
 */
export const adminInviteBody = ({ name, inviteLink, roleName, expiresIn }) => {
  return `
    <h2 style="margin-top:0;">You've been invited to the Gradient admin panel</h2>

    <p>Hello ${name},</p>

    <p>
      An account has been created for you${
        roleName ? ` with the <strong>${roleName}</strong> role` : ""
      }.
      Set a password to finish signing in.
    </p>

    <div style="text-align:center;margin:30px 0;">
      <a
        href="${inviteLink}"
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
        Set Your Password
      </a>
    </div>

    <p style="color:#6b7280;font-size:14px;">
      This link expires in ${expiresIn}. If it lapses, ask a Super Admin to
      resend the invite.
    </p>

    <p style="color:#6b7280;font-size:14px;">
      If you weren't expecting this, you can safely ignore this email.
    </p>
  `;
};
