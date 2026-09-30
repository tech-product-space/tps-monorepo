const { formatDataTime } = require("../../../utils/date");

const PM_FELLOWSHIP_URL = `${process.env.AIRTABLE_BASE_URL}/PM%20Fellowship`
const ADVANCE_AI_URL = `${process.env.AIRTABLE_BASE_URL}/AI%20for%20PM`

module.exports = {
  "pm-fellowship-enrollments": {
    url: PM_FELLOWSHIP_URL, 
    buildPayload: (lead) => ({
      fields: {
        Name: lead.name,
        "Mobile Number": lead.phone?.toString(),
        "Email Id": lead.email,
        Linkedin: lead.additionalData?.linkedin || "",
        Timestamp: formatDataTime(lead.createdAt),
        Source: "Enroll Now",
        "Student/Working": lead.additionalData?.profession || "",
        Role: lead.additionalData?.role || ""
      },
    }),
  },

  "pm-fellowship-download-curriculum": {
    url: PM_FELLOWSHIP_URL, 
    buildPayload: (lead) => ({
      fields: {
        Name: lead.name,
        "Mobile Number": lead.phone?.toString(),
        "Email Id": lead.email,
        Source: "Download Curriculum",
        Timestamp: formatDataTime(lead.createdAt),
      },
    }),
  },

  "ai-for-pm-enrollments": {
    url: ADVANCE_AI_URL,
    buildPayload: (lead) => ({
      fields: {
        Name: lead.name,
        "Mobile Number": lead.phone?.toString(),
        "Email Id": lead.email,
        Linkedin: lead.additionalData?.linkedin || "",
        Timestamp: formatDataTime(lead.createdAt),
        Source: "Enroll Now",
        "Student/Working": lead.additionalData?.profession || "",
        Role: lead.additionalData?.role || ""
      },
    }),
  },

  "ai-for-pm-download-curriculum": {
    url: ADVANCE_AI_URL, 
    buildPayload: (lead) => ({
      fields: {
        Name: lead.name,
        "Mobile Number": lead.phone?.toString(),
        "Email Id": lead.email,
        Source: "Download Curriculum",
        Timestamp: formatDataTime(lead.createdAt),
      },
    }),
  },
};
