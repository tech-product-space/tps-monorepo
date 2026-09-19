import psEnv from "@ps/env/gradient";
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
      region: psEnv.AWS_SES_REGION,
      accessKeyId: psEnv.AWS_SES_ACCES_KEY,
      secretAccessKey: psEnv.AWS_SES_SECRET_KEY,
    },
  },

  {
    provider: "aws",
    email: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
    auth: {
      user: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
      region: psEnv.AWS_SES_REGION,
      accessKeyId: psEnv.AWS_SES_ACCES_KEY,
      secretAccessKey: psEnv.AWS_SES_SECRET_KEY,
    },
  },

  // Last. Nothing sends from here by default any more; the account stays
  // registered only so campaigns, reminders and workflows already saved
  // against this address keep resolving.
  {
    provider: "outlook",
    email: EMAIL_PROVIDER_ID.PS_INFO_MAIL,
    auth: {
      user: psEnv.OUTLOOK_1_USER,
      clientId: psEnv.OUTLOOK_1_CLIENT_ID,
      clientSecret: psEnv.OUTLOOK_1_CLIENT_SECRET,
      tenantId: psEnv.OUTLOOK_1_TENANT_ID,
    },
  },

];
