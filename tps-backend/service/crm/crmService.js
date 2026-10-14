const axios = require("axios");

const BASE_URL = "https://crm-api.theproductspace.in";

async function postLead(payload) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/v1/leads/external`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000, // optional safety timeout
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "CRM Lead API Error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

module.exports = {
  postLead,
};
