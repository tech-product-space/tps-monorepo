module.exports = function mapUTMs(additionalData = {}) {
  return {
    "custom_fields.utmid": additionalData.utm_id ?? "",
    "custom_fields.utmmedium": additionalData.utm_medium ?? "",
    "custom_fields.utmsource": additionalData.utm_source ?? "",
    "custom_fields.utmcontent": additionalData.utm_content ?? "",
    "custom_fields.utmcampaign": additionalData.utm_campaign ?? "",
  };
};
