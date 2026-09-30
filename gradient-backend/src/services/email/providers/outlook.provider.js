import axios from "axios";
import { ConfidentialClientApplication } from "@azure/msal-node";

export const createOutlookTransport = ({
  clientId,
  clientSecret,
  tenantId,
  user,
}) => {
  const msalConfig = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  };

  const cca = new ConfidentialClientApplication(msalConfig);

  async function getAccessToken() {
    const response = await cca.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });

    return response.accessToken;
  }

  return {
    async sendMail({ to, subject, html, text, attachments = [], fromName }) {
      const accessToken = await getAccessToken();

      const recipients = Array.isArray(to)
        ? to.map((email) => ({
            emailAddress: { address: email },
          }))
        : [{ emailAddress: { address: to } }];

      const graphAttachments = attachments.map((att) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.filename,
        contentType: att.contentType,
        contentBytes: att.content.toString("base64"),
      }));

      const message = {
        message: {
          subject,
          body: {
            contentType: html ? "HTML" : "Text",
            content: html || text,
          },
          toRecipients: recipients,
          attachments: graphAttachments,
        },
        saveToSentItems: true,
      };

      await axios.post(
        `https://graph.microsoft.com/v1.0/users/${user}/sendMail`,
        message,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      // Graph's sendMail answers 202 with an empty body — there is no message
      // id to return, and no delivery-event stream to correlate one against.
      // Mail sent through this provider is therefore unmeasurable: sent or
      // failed, never delivered, bounced, opened or clicked.
      return { messageId: null };
    },
  };
};
