const {
  PlatformLead,
  ResourceLead,
  EventGuests,
  CalBooking,
} = require("../../models");
const { sendBulkLeads } = require("./services/sendLeads");

const platformLeadFetcher = require("./fetchers/platformLead.fetcher");
const mapPlatformLead = require("./mappers/platformLead.mapper");

const resourceLeadFetcher = require("./fetchers/resourceLead.fetcher");
const mapResourceLead = require("./mappers/resourceLead.mapper");

const eventGuestsFetcher = require("./fetchers/eventGuest.fetcher");
const mapEventGuestLead = require("./mappers/eventGuest.mapper");

const calBookingFetcher = require("./fetchers/calBooking.fetcher");
const mapCalBookingLead = require("./mappers/calBooking.mapper");

const BATCH_SIZE = 50;

async function run91Leads() {
  try {
    const leadGroups = {
      platformLeads: {
        fetcher: platformLeadFetcher,
        mapper: mapPlatformLead,
        model: PlatformLead,
        idKey: "lead_id",
      },
      resources: {
        fetcher: resourceLeadFetcher,
        mapper: mapResourceLead,
        model: ResourceLead,
        idKey: "lead_id",
      },
      events: {
        fetcher: eventGuestsFetcher,
        mapper: mapEventGuestLead,
        model: EventGuests,
        idKey: "lead_id",
      },

      calBookings: {
        fetcher: calBookingFetcher,
        mapper: mapCalBookingLead,
        model: CalBooking,
        idKey: "lead_id",
      },
    };

    for (const groupKey of Object.keys(leadGroups)) {
      const { fetcher, mapper, model, idKey } = leadGroups[groupKey];

      // 1️⃣ Fetch raw DB rows
      const rawLeads = await fetcher(BATCH_SIZE);
      if (!rawLeads.length) continue;

      // 2️⃣ Map for 91Leads
      const payload = rawLeads.map(mapper);

      // console.log(payload);
      
      // 3️⃣ Send to 91Leads
      const response = await sendBulkLeads(payload);

      if (response === null) {
        continue;
      }

      console.log(`---- ${groupKey} Summary ----`);
      console.log(response.summary);

      // 4️⃣ Extract successful DB IDs
      const successIds = [];
      const failed = [];
      response.results.forEach((r) => {
        if (r.success) {
          if (r.response?.data?.additional_data?.[idKey]) {
            successIds.push(r.response?.data?.additional_data?.[idKey]);
          }
        } else {
          failed.push(r.response);
        }
      });
      // const successIds = response.results
      //   .filter(r => r.success && r.response?.data?.additional_data?.[idKey])
      //   .map(r => r.response.data.additional_data[idKey]);
      // if (failed.length > 0) {
      // console.error(`----- Failed ${groupKey} ------`);
      //   for(let f of failed){
      //     console.error(f);
      //   }
      // }
      if (!successIds.length) continue;

      // 5️⃣ Mark as synced
      await model.update(
        {
          leads91Synced: true,
          leads91SyncedAt: new Date(),
        },
        {
          where: { id: successIds },
        },
      );

      // console.log(`✅ ${groupKey}: ${successIds.length} leads synced`);
    }
  } catch (error) {
    console.error("❌ Failed to run 91Leads cron");
    console.error(error);
  }
}

module.exports = { run91Leads };
