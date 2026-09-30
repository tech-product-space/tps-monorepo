const { formatDataTime } = require("../../../utils/date");
const mapUTMs = require("./utm.mapper");

module.exports = function mapResourceLead(lead) {
  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,

    source: "Website",
    sub_source: "Resources",
    Course: "Resources",

    "custom_fields.resourcename": lead.resource?.title ?? lead.resource?.resourceSlug ?? "",
    "custom_fields.role": lead.jobTitle ?? "",
    "custom_fields.timestamp": formatDataTime(lead.createdAt),

    ...mapUTMs(lead.additionalData),

    additional_data: {
      lead_id: lead.id,
      resource_id: lead.resourceId,
      visitor_id: lead.additionalData.visitorId || null,
    },
  };
};
