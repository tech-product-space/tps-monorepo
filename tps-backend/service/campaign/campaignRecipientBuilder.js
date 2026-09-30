const { resolveEventGuests } = require("./resolver/eventGuestResolver");
const { resolveExternalLeads } = require("./resolver/externalLeadResolver");
const { resolvePlatformLeads } = require("./resolver/platformLeadResolver");
const { resolveResourceLeads } = require("./resolver/resourceLeadResolver");
const {
  resolveRecordingLeads,
} = require("./resolver/recordingLeadResolver");
const { resolveContactLeads } = require("./resolver/contactLeadsResolver");

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function buildRecipients(filters) {
  let leads = [];

  for (const source of filters.sources) {
    if (source.type === "platform_leads") {
      const platformLeads = await resolvePlatformLeads(source.filters);
      leads.push(...platformLeads);
    }

    if (source.type === "external_leads") {
      const externalLeads = await resolveExternalLeads(source.filters);
      leads.push(...externalLeads);
    }

    if (source.type === "events") {
      const eventLeads = await resolveEventGuests(source.filters);
      leads.push(...eventLeads);
    }

    if (source.type === "resources") {
      const resourceLeads = await resolveResourceLeads(source.filters);
      leads.push(...resourceLeads);
    }

    if (source.type === "recordings") {
      const recordingLeads = await resolveRecordingLeads(source.filters);
      leads.push(...recordingLeads);
    }

    if (source.type === "contact_list") {
      const resourceLeads = await resolveContactLeads(source.filters);
      leads.push(...resourceLeads);
    }

    // if (source.type === "visitor_tracking") {
    //   const visitorLeads = await resolveVisitorLeads(source.filters);

    //   leads.push(...visitorLeads);
    // }
  }

  // dedupe by email
  const map = new Map();

  for (const lead of leads) {
    if (!isValidEmail(lead.email)) continue;

    const email = lead.email.trim().toLowerCase();

    if (!map.has(email)) {
      map.set(email, {
        ...lead,
        email,
        name: lead.name?.trim() || null,
        phone: lead.phone?.trim() || null,
      });
    }
  }

  return [...map.values()];
}

module.exports = {
  buildRecipients,
};
