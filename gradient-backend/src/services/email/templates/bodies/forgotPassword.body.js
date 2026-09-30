export const forgotPasswordBody = ({ name, resetLink }) => {
  return `
    <h2 style="margin-top:0;">Password Reset</h2>

    <p>Hello ${name},</p>

    <p>
      We received a request to reset your password.
      Click the button below to create a new password.
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
        Reset Password
      </a>
    </div>

    <p style="color:#6b7280;font-size:14px;">
      This link will expire in 15 minutes.
    </p>

    <p style="color:#6b7280;font-size:14px;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `;
};
