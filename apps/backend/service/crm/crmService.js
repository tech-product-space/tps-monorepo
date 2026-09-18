const axios = require("axios");

const BASE_URL = "https://crm-api.theproductspace.in";

async function postLead({ name, phone, email, country_code, product_id }) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/v1/leads/external`,
      {
        name,
        phone,
        country_code,
        email,
        product_id,
      },
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