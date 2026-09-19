const psEnv = require("@ps/env/tps");
const axios = require("axios");
const { chunk } = require("../../helper");

const BASE_URL = psEnv['91LEADS_BASE_URL'];
const TOKEN = psEnv['91LEADS_TOKEN'];

async function sendBulkLeads(leads) {  
  try {    
    const response = await axios.post(`${BASE_URL}/api/external-leads/multi-create`,
      { leads },
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        'Content-Type': 'application/json',
      }
    );

    return response.data;
  } catch (error) {
    console.log("Failed to send bulk leads to 91Leads");
    console.error(JSON.stringify(error.response.data, null, 2));
    return null;
  }
}

module.exports = {sendBulkLeads}