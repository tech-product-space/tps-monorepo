const psEnv = require("@ps/env/crm");
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Sequelize, QueryTypes } = require("sequelize");

const leadService = require("../services/lead.service");
const { extractPhoneDetails } = require("../utils/helper/phone");

const tpsDB = new Sequelize(psEnv.TPS_DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

async function run() {
  try {
    const limit = 500;
    let offset = 0;
    let hasMore = true;
    const tempDir = path.join(process.cwd(), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const failureLogPath = path.join(
      tempDir,
      `resource-lead-sync-failures-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.jsonl`,
    );
    let failureCount = 0;

    console.log("Starting Resource Lead Migration...");

    const retryIds = []; // set to [123, 456] when retrying specific resource leads
    const retryFilter = retryIds && retryIds.length > 0;

    while (hasMore) {
      const replacements = retryFilter
        ? { limit, offset, retryIds }
        : { limit, offset };

      const resourceLeads = await tpsDB.query(
        `
        SELECT 
          rl.id AS resource_lead_id,
          rl."createdAt",
          rl."resourceId",
          rl.name,
          rl.email,
          rl.phone,
          rl."jobTitle",
          rl."additionalData",
          r.title AS "resourceName"
        FROM "ResourceLeads" rl
        LEFT JOIN "Resources" r
        ON r.id = rl."resourceId"
        ${retryFilter ? 'WHERE rl.id IN (:retryIds)' : ''}
        ORDER BY rl."createdAt" ASC
        LIMIT :limit OFFSET :offset
        `,
        {
          replacements,
          type: QueryTypes.SELECT,
        },
      );

      if (resourceLeads.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`Processing ${resourceLeads.length} resource leads`);

      for (const item of resourceLeads) {
        try {
          if (!item.phone && !item.email) continue;

          const additionalData =
            typeof item.additionalData === "string"
              ? JSON.parse(item.additionalData)
              : item.additionalData || {};

          const { countryCode, phoneNumber } = extractPhoneDetails(item.phone);

          const visitorId = additionalData?.visitorId || null;

          const payload = {
            product_id: "Resources",

            name: item.name,
            email: item.email,
            phone: phoneNumber,
            country_code: countryCode,

            utm_id: additionalData?.utm_id ?? "",
            utm_source: additionalData?.utm_source ?? "",
            utm_medium: additionalData?.utm_medium ?? "",
            utm_campaign: additionalData?.utm_campaign ?? "",
            utm_content: additionalData?.utm_content ?? "",

            extra_fields: {
              resourceName: item.resourceName,
              resourceJobTitle: item.jobTitle,
              resourceCreatedAt: item.createdAt,
            },

            additional_data: {
              resource_lead_id: item.resource_lead_id,
              resource_id: item.resourceId,
              visitor_id: visitorId,
            },
          };

          // throw new Error("error")
          await leadService.createOrProcessReentry(payload);

          console.log(`Synced Resource Lead ${item.resource_lead_id}`);
        } catch (err) {
          console.error(
            "Resource Lead failed:",
            item.resource_lead_id,
            err.message,
          );

          failureCount += 1;
          const failureRecord = {
            resource_lead_id: item.resource_lead_id,
            resource_id: item.resourceId,
            created_at: item.createdAt,
            name: item.name,
            email: item.email,
            phone: item.phone,
            error: err.message,
            timestamp: new Date().toISOString(),
          };

          try {
            fs.appendFileSync(
              failureLogPath,
              `${JSON.stringify(failureRecord)}\n`,
              "utf-8",
            );
          } catch (fileErr) {
            console.error(
              "Failed to write resource lead failure log:",
              fileErr.message,
            );
          }
        }
      }

      offset += limit;
    }

    console.log("Resource migration completed");
    if (failureCount > 0) {
      console.log(
        `${failureCount} resource lead(s) failed. Details saved at ${failureLogPath}`,
      );
    }
    process.exit();
  } catch (error) {
    console.error(error);
  }
}

run();
