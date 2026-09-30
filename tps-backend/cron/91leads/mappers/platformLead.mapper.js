const { formatDataTime } = require("../../../utils/date");
const { formatNextFollowup } = require("../helper");
const mapUTMs = require("./utm.mapper");

module.exports = function mapPlatformLead(lead) {
  let data = {
    sub_source: "",
    Course: "",
  };

  switch (lead.type) {
    case "pm-fellowship-enrollments":
      data.sub_source = "PM Fellowship";
      data.Course = "PM Fellowship";
      data["Course Type"] = "Paid";
      data.type = "Enroll Now";
      data["custom_fields.linkedin"] = lead.additionalData?.linkedin ?? "";
      data["custom_fields.role"] = lead.additionalData?.role ?? "";
      data["custom_fields.profession"] = lead.additionalData?.profession ?? "";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "pm-fellowship-download-curriculum":
      data.sub_source = "PM Fellowship";
      data.Course = "PM Fellowship";
      data["Course Type"] = "Paid";
      data.type = "Download Curriculum";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "ai-for-pm-enrollments":
      data.sub_source = "Advanced AI Program";
      data.Course = "Advanced AI Program";
      data["Course Type"] = "Paid";
      data.type = "Enroll Now";
      data["custom_fields.linkedin"] = lead.additionalData?.linkedin ?? "";
      data["custom_fields.role"] = lead.additionalData?.role ?? "";
      data["custom_fields.profession"] = lead.additionalData?.profession ?? "";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "ai-for-pm-download-curriculum":
      data.sub_source = "Advanced AI Program";
      data.Course = "Advanced AI Program";
      data["Course Type"] = "Paid";
      data.type = "Download Curriculum";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "interview-course-enrollments":
      data.sub_source = "Interview Course";
      data.Course = "Interview Course";
      data["Course Type"] = "Paid";
      data.type = "Enroll Now";
      data["custom_fields.linkedin"] = lead.additionalData?.linkedin ?? "";
      data["custom_fields.role"] = lead.additionalData?.role ?? "";
      data["custom_fields.profession"] = lead.additionalData?.profession ?? "";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "interview-course-download-curriculum":
      data.sub_source = "Interview Course";
      data.Course = "Interview Course";
      data["Course Type"] = "Paid";
      data.type = "Download Curriculum";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "free-course-enrollments":
      data.sub_source = "AI Builders 101";
      data.Course = "AI Builders 101";
      data["Course Type"] = "Free";
      data.type = "Enroll Now";
      data["custom_fields.linkedin"] = lead.additionalData?.linkedin ?? "";
      data["custom_fields.role"] = lead.additionalData?.role ?? "";
      data["custom_fields.profession"] = lead.additionalData?.profession ?? "";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "contact-us":
      data.sub_source = "Contact Us";
      data.Course = "Contact Us";
      data["custom_fields.query"] = lead.additionalData?.query ?? "";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "request-callback":
      const {
        preferredDate,
        preferredTime,
        country_code = "",
      } = lead.additionalData;

      if (preferredDate && preferredTime) {
        data.next_followup_date = formatNextFollowup(
          preferredDate,
          preferredTime,
        );
      }

      data.sub_source = "Request Callback";
      data.Course = "Request Callback";
      data["custom_fields.pagesource"] = lead.additionalData?.linkedin ?? "";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "gen-ai-enrollments":
      data.sub_source = "Gen AI Program";
      data.Course = "Gen AI Program";
      data["Course Type"] = "Paid";
      data.type = "Enroll Now";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      data["custom_fields.lookingfor"] = lead.additionalData?.lookingFor ?? "";
      data["custom_fields.linkedin"] = lead.additionalData?.linkedin ?? "";
      data["custom_fields.companyname"] =
        lead.additionalData?.companyName ?? "";
      data["custom_fields.experience"] = lead.additionalData?.experience ?? "";
      data["custom_fields.website"] = lead.additionalData?.website ?? "";
      data["custom_fields.teamsize"] = lead.additionalData?.teamSize ?? "";
      break;

    case "gen-ai-download-curriculum":
      data.sub_source = "Gen AI Program";
      data.Course = "Gen AI Program";
      data["Course Type"] = "Paid";
      data.type = "Download Curriculum";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "gen-ai-contact-us":
      data.sub_source = "Gen AI Program";
      data.Course = "Gen AI Program";
      data["Course Type"] = "Paid";
      data.type = "Contact Us";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      data["custom_fields.companyname"] =
        lead.additionalData?.company_name ?? "";
      data["custom_fields.website"] = lead.additionalData?.website ?? "";
      data["custom_fields.teamsize"] = lead.additionalData?.teamSize ?? "";
      break;

    case "ai-for-product-leaders-enrollments":
      data.sub_source = "AI For Product Leaders";
      data.Course = "AI For Product Leaders";
      data["Course Type"] = "Paid";
      data.type = "Enroll Now";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      data["custom_fields.lookingfor"] = lead.additionalData?.lookingFor ?? "";
      data["custom_fields.linkedin"] = lead.additionalData?.linkedin ?? "";
      data["custom_fields.companyname"] =
        lead.additionalData?.companyName ?? "";
      data["custom_fields.experience"] = lead.additionalData?.experience ?? "";
      data["custom_fields.website"] = lead.additionalData?.website ?? "";
      data["custom_fields.teamsize"] = lead.additionalData?.teamSize ?? "";
      break;

    case "ai-for-product-leaders-download-curriculum":
      data.sub_source = "AI For Product Leaders";
      data.Course = "AI For Product Leaders";
      data["Course Type"] = "Paid";
      data.type = "Download Curriculum";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      break;

    case "ai-for-product-leaders-contact-us":
      data.sub_source = "AI For Product Leaders";
      data.Course = "AI For Product Leaders";
      data["Course Type"] = "Paid";
      data.type = "Contact Us";
      data["custom_fields.countrycode"] =
        lead.additionalData?.country_code ?? "";
      data["custom_fields.companyname"] =
        lead.additionalData?.company_name ?? "";
      data["custom_fields.website"] = lead.additionalData?.website ?? "";
      data["custom_fields.teamsize"] = lead.additionalData?.teamSize ?? "";
      break;
      
    case "ai-for-pm-scholarship":
      data.sub_source = "Advanced AI Program";
      data.Course = "Advanced AI Program";
      data["Course Type"] = "Paid";
      data.type = "Scholarship";
      data["custom_fields.linkedin"] = lead.additionalData?.linkedin ?? "";
      data["custom_fields.role"] = lead.additionalData?.current_job_title ?? "";
      data["custom_fields.profession"] = lead.additionalData?.profession ?? "";
      data["custom_fields.companyname"] = lead.additionalData?.current_company ?? "";
      data["custom_fields.countrycode"] =lead.additionalData?.country_code ?? "";
      break;

    default:
      data.sub_source = lead.type;
      data.Course = lead.type;
      break;
  }

  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    source: "Website",
    ...data,
    ...mapUTMs(lead.additionalData),
    "custom_fields.timestamp": formatDataTime(lead.createdAt),
    additional_data: {
      lead_id: lead.id,
      visitor_id: lead.additionalData.visitorId || null,
    },
  };
};
