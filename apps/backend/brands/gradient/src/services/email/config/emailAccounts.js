import dotenv from "dotenv";
import { EMAIL_PROVIDER_ID } from "./constants.js";
dotenv.config();

export const EMAIL_ACCOUNTS = [
  // First, so it is what an unpinned sendMail falls through to. Course, event
  // guest, lead and password mail all pin it explicitly. Same SES credentials
  // as the noreply identity — sending as this address needs the
  // gradientlearnings.org domain (or this address) verified in SES.
  {
    provider: "aws",
    email: EMAIL_PROVIDER_ID.GD_INFO_MAIL,
    auth: {
      user: EMAIL_PROVIDER_ID.GD_INFO_MAIL,
      region: process.env.AWS_SES_REGION,
      accessKeyId: process.env.AWS_SES_ACCES_KEY,
      secretAccessKey: process.env.AWS_SES_SECRET_KEY,
    },
  },

  {
    provider: "aws",
    email: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
    auth: {
      user: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
      region: process.env.AWS_SES_REGION,
      accessKeyId: process.env.AWS_SES_ACCES_KEY,
      secretAccessKey: process.env.AWS_SES_SECRET_KEY,
    },
  },

  // Last. Nothing sends from here by default any more; the account stays
  // registered only so campaigns, reminders and workflows already saved
  // against this address keep resolving.
  {
    provider: "outlook",
    email: EMAIL_PROVIDER_ID.PS_INFO_MAIL,
    auth: {
      user: process.env.OUTLOOK_1_USER,
      clientId: process.env.OUTLOOK_1_CLIENT_ID,
      clientSecret: process.env.OUTLOOK_1_CLIENT_SECRET,
      tenantId: process.env.OUTLOOK_1_TENANT_ID,
    },
  },

];
