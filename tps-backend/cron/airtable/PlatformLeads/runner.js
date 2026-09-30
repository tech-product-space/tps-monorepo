const axios = require("axios");
const { PlatformLead } = require("../../../models");
const { Op } = require("sequelize");
const mapper = require("./mapper");

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

async function runPlatformLeadsSync() {
  try {
    const leads = await PlatformLead.findAll({
      where: {
        airtableSynced: false,
        type: { [Op.in]: Object.keys(mapper) },
      },
      order: [["createdAt", "ASC"]],
    });

    if (leads.length === 0) return;

    for (const lead of leads) {
      const config = mapper[lead.type];
      if (!config) continue;

      const payload = config.buildPayload(lead);

      try {
        await axios.post(config.url, payload, {
          headers: {
            Authorization: `Bearer ${AIRTABLE_TOKEN}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        });

        // Mark ONLY after success
        await PlatformLead.update(
          {
            airtableSynced: true,
            airtableSyncedAt: new Date(),
          },
          { where: { id: lead.id } }
        );

        // Rate-limit safe (~4 req/sec)
        await new Promise((r) => setTimeout(r, 250));
      } catch (error) {
        console.error("❌ Airtable single record failed", {
          leadId: lead.id,
          type: lead.type,
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });
      }
    }
  } catch (error) {
    console.error("🔴 Error syncing leads to Airtable:", error);
  }
}

module.exports = { runPlatformLeadsSync };