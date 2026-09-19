const resetPasswordEmailTemplate = (name, resetLink) => `
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style type="text/css">
            body, p, td, th {
                font-family: Arial, sans-serif;
                font-size: 14px;
                line-height: 1.5;
                color: #333333;
            }
            body {
                margin: 0;
                padding: 0;
                width: 100% !important;
                background-color: #f5f5f5;
            }
            table {
                border-spacing: 0;
                border-collapse: collapse;
            }
            img {
                border: 0;
                line-height: 100%;
                outline: none;
                text-decoration: none;
            }
            @media only screen and (max-width: 600px) {
                .container {
                    width: 100% !important;
                }
                .mobile-padding {
                    padding-left: 15px !important;
                    padding-right: 15px !important;
                }
            }
        </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f5f5f5;">
        
        <div style="display: none; max-height: 0; overflow: hidden;">
            Reset your password - secure link inside
        </div>

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
            <tr>
            <td align="center">
                <table class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                
                <!-- Header -->
                <tr>
                    <td align="center" bgcolor="#345DC7" style="padding: 30px 0; font-size: 24px; font-weight: bold; color: #ffffff;">
                        The Product Space
                    </td>
                </tr>

                <!-- Body -->
                <tr>
                    <td class="mobile-padding" style="padding: 40px 30px;">
                        <table width="100%">
                        
                        <tr>
                            <td style="padding-bottom: 20px; font-size: 24px; font-weight: bold;">
                                Reset Your Password
                            </td>
                        </tr>

                        <tr>
                            <td style="padding-bottom: 20px; color: #666666;">
                                <p>Hello ${name || ""},</p>
                                <p>We received a request to reset your password.</p>
                                <p>Click the button below to create a new password:</p>
                            </td>
                        </tr>

                        <tr>
                            <td align="center" style="padding: 30px 0;">
                                <table>
                                <tr>
                                    <td align="center" bgcolor="#345DC7" style="border-radius: 4px;">
                                        <a href="${resetLink}" target="_blank" 
                                            style="display: inline-block; padding: 16px 36px; font-size: 16px; color: #ffffff; 
                                            text-decoration: none; border-radius: 4px; font-weight: bold;">
                                            Reset Password
                                        </a>
                                    </td>
                                </tr>
                                </table>
                            </td>
                        </tr>

                        <tr>
                            <td style="padding-bottom: 20px; color: #666666;">
                                <p>If the button doesn't work, copy and paste this link:</p>
                                <p style="word-break: break-all; color: #4f46e5;">${resetLink}</p>
                                <p><strong>This link will expire in 15 minutes.</strong></p>
                            </td>
                        </tr>

                        <tr>
                            <td style="color: #666666;">
                                <p>If you didn't request this, no action is required — your password is safe.</p>
                            </td>
                        </tr>

                        </table>
                    </td>
                </tr>

                <!-- Footer -->
                <tr>
                    <td bgcolor="#f8f9fa" style="padding: 20px 30px;">
                        <table width="100%">
                            <tr>
                                <td style="color: #999999; font-size: 12px; text-align: center;">
                                    <p>If you didn't request a password reset, please ignore this email.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                </table>
            </td>
            </tr>
        </table>
        </body>
        </html>
`;

module.exports = resetPasswordEmailTemplate;
