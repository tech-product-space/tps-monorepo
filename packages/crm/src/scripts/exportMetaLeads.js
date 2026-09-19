const psEnv = require("@ps/env/crm");
require("dotenv").config({ path: "../../.env" });
const axios = require("axios");
const fs = require("fs");

const PAGE_ID = "361603210370170";
const PAGE_TOKEN = psEnv.META_PAGE_TOKEN;

const BASE_URL = "https://graph.facebook.com/v22.0";

async function getForms() {
  const res = await axios.get(`${BASE_URL}/${PAGE_ID}/leadgen_forms`, {
    params: { access_token: PAGE_TOKEN },
  });

  return res.data.data || [];
}

async function getAllLeads(formId) {
  let leads = [];
  let url = `${BASE_URL}/${formId}/leads`;

  let params = {
    access_token: PAGE_TOKEN,
    fields:
      "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_name,campaign_id,field_data",
    limit: 500,
  };

  while (url) {
    const res = await axios.get(url, { params });

    leads.push(...(res.data.data || []));

    url = res.data.paging?.next || null;
    params = {}; // next already contains token
  }

  return leads;
}

function flattenLead(lead) {
  const row = {
    lead_id: lead.id,
    created_time: lead.created_time,
    ad_id: lead.ad_id,
    ad_name: lead.ad_name,
    adset_id: lead.adset_id,
    adset_name: lead.adset_name,
    campaign_id: lead.campaign_id,
    campaign_name: lead.campaign_name,
  };

  if (lead.field_data) {
    lead.field_data.forEach((f) => {
      row[f.name] = f.values?.join(", ");
    });
  }

  return row;
}

function convertToCSV(rows) {
  const columns = new Set();

  rows.forEach((r) => {
    Object.keys(r).forEach((k) => columns.add(k));
  });

  const headers = Array.from(columns);

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => `"${(row[h] || "").toString().replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");

  return csv;
}

async function run() {
  console.log("Fetching forms...");

  const forms = await getForms();

  let allRows = [];

  for (const form of forms) {
    console.log(`Fetching leads for form: ${form.name}`);

    const leads = await getAllLeads(form.id);

    const rows = leads.map(flattenLead);

    allRows.push(...rows);

    console.log(`Fetched ${rows.length}`);
  }

  const csv = convertToCSV(allRows);

  fs.writeFileSync("facebook_leads_export.csv", csv);

  console.log(`Export completed → ${allRows.length} leads`);
}

run();
