const inviteEmailTemplate = () => `
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>You're Invited!</title>
        <style type="text/css">
            /* Reset styles */
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
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
            }
            img {
            border: 0;
            line-height: 100%;
            outline: none;
            text-decoration: none;
            -ms-interpolation-mode: bicubic;
            }
            /* Responsive styles */
            @media only screen and (max-width: 600px) {
            .container {
                width: 100% !important;
            }
            .mobile-padding {
                padding-left: 15px !important;
                padding-right: 15px !important;
            }
            .mobile-stack {
                display: block !important;
                width: 100% !important;
            }
            }
        </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f5f5f5;">
        <!-- Preheader text (hidden) -->
        <div style="display: none; max-height: 0; overflow: hidden;">
            You've been invited to join our platform - click to accept your invitation
        </div>
        
        <!-- Main container -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5; padding: 20px 0;">
            <tr>
            <td align="center">
                <!-- Email container -->
                <table class="container" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <!-- Header -->
                <tr>
                    <td align="center" bgcolor="#4f46e5" style="padding: 30px 0; font-size: 24px; font-weight: bold; color: #ffffff;">
                    The Product Space
                    </td>
                </tr>
                
                <!-- Content -->
                <tr>
                    <td class="mobile-padding" style="padding: 40px 30px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                        <td style="padding-bottom: 20px; font-size: 24px; font-weight: bold; color: #333333;">
                            You're Invited!
                        </td>
                        </tr>
                        <tr>
                        <td style="padding-bottom: 20px; color: #666666;">
                            <p>Hello,</p>
                            <p>You've been invited to join our platform. We're excited to have you on board!</p>
                            <p>Click the button below to accept your invitation and get started:</p>
                        </td>
                        </tr>
                        <tr>
                        <td align="center" style="padding: 30px 0;">
                            <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                                <td align="center" bgcolor="#4f46e5" style="border-radius: 4px;">
                                <a href="{{inviteLink}}" target="_blank" style="display: inline-block; padding: 16px 36px; font-size: 16px; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold;">Accept Invitation</a>
                                </td>
                            </tr>
                            </table>
                        </td>
                        </tr>
                        <tr>
                        <td style="padding-bottom: 20px; color: #666666;">
                            <p>If the button doesn't work, you can copy and paste the following link into your browser:</p>
                            <p style="word-break: break-all; color: #4f46e5;">{{inviteLink}}</p>
                            <p>This invitation link will expire in 7 days.</p>
                        </td>
                        </tr>
                    </table>
                    </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                    <td bgcolor="#f8f9fa" style="padding: 20px 30px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                        <td style="color: #999999; font-size: 12px; text-align: center;">
                            <p>&copy; 2025 The Product Space. All rights reserved.</p>
                            <p>
                            If you didn't request this invitation, please ignore this email.
                            </p>
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

module.exports = inviteEmailTemplate;
