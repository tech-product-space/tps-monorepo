"use strict";

const crypto = require("crypto");
const { MetaLead } = require("../models");
const axiosClient = require("../cron/meta/axios");

const BASE_URL = "https://graph.facebook.com/v22.0";

// Status label (case-insensitive) that triggers a Conversions API event.
const ENROLLED_LABEL = "enrolled";

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

// Meta wants E.164 digits without "+" (e.g. 919876543210), hashed.
function hashPhone(phone, countryCode) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const cc = String(countryCode || "+91").replace(/\D/g, "");
  const full = digits.length <= 10 && cc ? `${cc}${digits}` : digits;
  return sha256(full);
}

function hashEmail(email) {
  const clean = String(email || "").trim().toLowerCase();
  return clean ? sha256(clean) : null;
}

function hashName(name) {
  const clean = String(name || "").trim().toLowerCase();
  return clean ? sha256(clean) : null;
}

// Matches on label, with the status id (e.g. "s_enrolled_sy03g") as a fallback
// in case the label is ever renamed.
function isEnrolledStatus(statusId, label) {
  return (
    String(label || "").trim().toLowerCase() === ENROLLED_LABEL ||
    String(statusId || "").toLowerCase().startsWith(`s_${ENROLLED_LABEL}`)
  );
}

/**
 * Send an "Enrolled" CRM event for a lead to Meta's Conversions API.
 * Never throws — failures are logged so the CRM update is never affected.
 */
async function sendEnrolledEvent(lead, profile) {
  const pixelId = process.env.META_CAPI_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    console.warn("[Meta CAPI] META_CAPI_PIXEL_ID / META_CAPI_ACCESS_TOKEN not set — skipping.");
    return;
  }

  try {
    // Meta leadgen id links this event back to the original Lead Ad.
    const metaLead = await MetaLead.findOne({
      where: { lead_id: lead.id },
      attributes: ["meta_lead_id"],
    });

    const [firstName, ...rest] = String(profile.name || "").trim().split(/\s+/);
    const userData = {
      em: [hashEmail(profile.email)].filter(Boolean),
      ph: [hashPhone(profile.phone, profile.country_code)].filter(Boolean),
      fn: [hashName(firstName)].filter(Boolean),
      ln: [hashName(rest.join(" "))].filter(Boolean),
      external_id: [sha256(String(profile.id))],
    };
    if (metaLead?.meta_lead_id) {
      userData.lead_id = metaLead.meta_lead_id
      console.log(`[Meta CAPI] Using meta_lead_id ${metaLead.meta_lead_id} for lead ${lead.id}`);
    };

    const event = {
      event_name: process.env.META_CAPI_EVENT_NAME || "Enrolled",
      event_time: Math.floor(Date.now() / 1000),
      event_id: `enrolled_${lead.id}`, // lets Meta dedupe repeat sends
      action_source: "system_generated",
      user_data: userData,
      custom_data: {
        event_source: "crm",
        lead_event_source: "TPS CRM",
        content_name: lead.product_id || undefined,
      },
    };

    const body = { data: [event] };
    if (process.env.META_CAPI_TEST_EVENT_CODE) {
      body.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;
      console.log("meta test id", process.env.META_CAPI_TEST_EVENT_CODE);
    }

    const { data } = await axiosClient.post(`${BASE_URL}/${pixelId}/events`, body, {
      params: { access_token: accessToken },
    });
    console.log(`[Meta CAPI] Enrolled event sent for lead ${lead.id}:`, data);
  } catch (error) {
    console.error(
      `[Meta CAPI] Failed to send Enrolled event for lead ${lead.id}:`,
      error.response?.data || error.message,
    );
  }
}

module.exports = { sendEnrolledEvent, isEnrolledStatus };
