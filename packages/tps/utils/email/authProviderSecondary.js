const psEnv = require("@ps/env/tps");
// email/authProvider.js
const { ConfidentialClientApplication } = require("@azure/msal-node");
require("dotenv").config();

const msalConfig = {
  auth: {
    clientId: psEnv.CLIENT_ID2,
    authority: `https://login.microsoftonline.com/${psEnv.TENANT_ID2}`,
    clientSecret: psEnv.CLIENT_SECRET2,
  },
};

const cca = new ConfidentialClientApplication(msalConfig);

const getAccessToken = async () => {
  try {
    const result = await cca.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });
    return result.accessToken;
  } catch (err) {
    console.error("🔴 Failed to fetch access token:", err.message);
    throw err;
  }
};

module.exports = { getAccessToken };
