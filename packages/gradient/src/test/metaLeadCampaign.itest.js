/**
 * Facebook leads as a campaign audience, end to end:
 *
 *   node src/test/metaLeadCampaign.itest.js
 *
 * Walks the whole marketing-campaign path the new selector opens up — the
 * options the picker reads, every filter key it can write, the validation a
 * save passes through, the resolver, the preview's arithmetic, dedupe against
 * another source, and the exclude side.
 *
 * **Automations are deliberately out of scope here.** A static-list workflow
 * resolves through the same `buildRecipients`, so the audience half is covered
 * by the same assertions; the trigger and its enrolment gates have their own
 * test in `metaLeadTrigger.itest.js`.
 *
 * Reads real rows. The one write — a phone-only lead, which the beta data
 * happens not to contain and which is the whole point of the unemailable
 * count — is inserted under a marker id and deleted in a `finally`.
 */

import { Op } from "sequelize";

import db from "../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../config/constants/campaign.js";
import { META_LEAD_STATUS } from "../config/constants/metaLead.js";
import { buildRecipients } from "../services/campaign/buildRecipients.js";
import {
  isSupportedSourceType,
  RESOLVERS,
} from "../services/campaign/recipientResolver/index.js";
import {
  resolveMetaLeads,
  countUnemailableMetaLeads,
} from "../services/campaign/recipientResolver/metaLeadResolver.js";
import {
  listAudienceSources,
  previewRecipients,
} from "../controllers/campaign/audience.controller.js";
import { listFilters } from "../controllers/meta/lead.controller.js";
import { validateWorkflow } from "../services/workflow/validate.js";

const { MetaLead, Campaign } = db;

let passed = 0;
let failed = 0;

const report = (name, ok, detail = "") => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`,
  );
};

const check = async (name, fn) => {
  try {
    const detail = await fn();
    report(name, true, detail ?? "");
  } catch (err) {
    report(name, false, err.message);
  }
};

const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

/**
 * Enough of an Express res to run a controller without standing a server up.
 *
 * The completion signal is `res.json`, not the handler's return value:
 * `asyncWrapper` calls the controller and returns undefined rather than its
 * promise, so awaiting the handler would come back before it had answered.
 */
const run = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = { statusCode: 200, body: null };

    res.status = (code) => {
      res.statusCode = code;
      return res;
    };

    res.json = (payload) => {
      res.body = payload;
      resolve(res);
      return res;
    };

    try {
      handler(req, res, (err) => (err ? reject(err) : resolve(res)));
    } catch (err) {
      reject(err);
    }
  });

const MARKER = "itest-phone-only-meta-lead";
let seededLeadId = null;
let seededCampaignId = null;

try {
  /* ── 0. what the picker will actually be choosing from ─────────────────── */

  console.log("\n── the options the picker reads (GET /meta/leads/filters) ──");

  const filtersRes = await run(listFilters, { query: {} });
  const options = filtersRes.body?.data;

  await check("endpoint answers 200 with the six lists", () => {
    assert(filtersRes.statusCode === 200, `got ${filtersRes.statusCode}`);
    for (const key of [
      "accounts",
      "forms",
      "campaigns",
      "adsets",
      "ads",
      "sources",
    ]) {
      assert(Array.isArray(options?.[key]), `${key} is not an array`);
    }
    return `${options.forms.length} forms, ${options.campaigns.length} campaigns, ${options.adsets.length} ad sets, ${options.ads.length} ads`;
  });

  await check("every option carries the {id,name} the step renders", () => {
    for (const key of ["forms", "campaigns", "adsets", "ads", "accounts"]) {
      for (const option of options[key]) {
        assert(option.id, `${key} has an option with no id`);
        assert(option.name, `${key} option ${option.id} has no name`);
      }
    }
    return "id and name present on all";
  });

  const aForm = options.forms[0];
  const aCampaign = options.campaigns[0];
  const anAdset = options.adsets[0];
  const anAd = options.ads[0];
  const anAccount = options.accounts[0];
  const aSource = options.sources.find((s) => s.source);

  /* ── 1. every filter key the new UI can write ──────────────────────────── */

  console.log("\n── each filter key the selector writes, resolved for real ──");

  const wide = await resolveMetaLeads({});

  await check("no filters resolves everyone with an address", () => {
    assert(Array.isArray(wide), "not an array");
    assert(wide.length > 0, "resolved nobody — the fixture data is empty");
    return `${wide.length} people`;
  });

  await check("every recipient is shaped for buildRecipients", () => {
    for (const row of wide) {
      assert(row.email, "a recipient came back with no email");
      assert(
        row.sourceType === CAMPAIGN_SOURCE_TYPE.META_LEADS,
        `sourceType is ${row.sourceType}`,
      );
      assert(row.sourceId, "no sourceId to trace the person back to");
    }
    return "email, sourceType and sourceId on all";
  });

  // The four hierarchy levels the drill-down writes, each as the array that
  // step stores, plus the account chips. Narrower than everything, and never
  // empty for a value that came out of the options endpoint.
  for (const [label, key, value] of [
    ["formId (the drill-down's Form tab)", "formId", aForm?.id],
    ["campaignId (Campaign tab)", "campaignId", aCampaign?.id],
    ["adsetId (Ad set tab)", "adsetId", anAdset?.id],
    ["adId (Ad tab)", "adId", anAd?.id],
    ["accountId (the inline page chips)", "accountId", anAccount?.id],
  ]) {
    await check(label, async () => {
      assert(value, "no value available in the fixture data");
      const rows = await resolveMetaLeads({ [key]: [value] });
      assert(Array.isArray(rows), "not an array");
      assert(
        rows.length <= wide.length,
        `narrowing widened the audience: ${rows.length} > ${wide.length}`,
      );
      assert(rows.length > 0, "a value from the options list matched nobody");
      return `${rows.length} of ${wide.length}`;
    });
  }

  await check("source (inline chips)", async () => {
    assert(aSource, "no source in the fixture data");
    const rows = await resolveMetaLeads({ source: [aSource.source] });
    assert(rows.length > 0, "a source that exists resolved nobody");
    return `${rows.length} from "${aSource.source}"`;
  });

  await check("status (inline chips)", async () => {
    const rows = await resolveMetaLeads({ status: [META_LEAD_STATUS.NEW] });
    assert(Array.isArray(rows), "not an array");
    return `${rows.length} new`;
  });

  await check(
    "createdFrom / createdTo narrows on Facebook's own timestamp",
    async () => {
      const [[range]] = await db.sequelize.query(
        `SELECT min("sourceCreatedAt") a, max("sourceCreatedAt") b FROM meta_leads`,
      );
      const midpoint = new Date(
        (new Date(range.a).getTime() + new Date(range.b).getTime()) / 2,
      );
      const iso = midpoint.toISOString().slice(0, 10);

      const before = await resolveMetaLeads({ createdTo: iso });
      const after = await resolveMetaLeads({ createdFrom: iso });

      assert(
        before.length < wide.length && after.length < wide.length,
        "a half-range returned everyone — the date filter is not applied",
      );
      return `${before.length} on or before ${iso}, ${after.length} on or after`;
    },
  );

  await check("two keys AND rather than OR", async () => {
    assert(aForm && aCampaign, "not enough fixture data");
    const both = await resolveMetaLeads({
      formId: [aForm.id],
      campaignId: [aCampaign.id],
    });
    const justForm = await resolveMetaLeads({ formId: [aForm.id] });
    assert(
      both.length <= justForm.length,
      `adding a campaign widened it: ${both.length} > ${justForm.length}`,
    );
    return `form=${justForm.length}, form+campaign=${both.length}`;
  });

  await check("an unknown id resolves nobody rather than everybody", async () => {
    const rows = await resolveMetaLeads({ formId: ["000-no-such-form"] });
    assert(rows.length === 0, `resolved ${rows.length} people`);
    return "0";
  });

  await check("skipped leads are excluded by default", async () => {
    const [[row]] = await db.sequelize.query(
      `SELECT count(*) FROM meta_leads WHERE status = 'skipped' AND email IS NOT NULL`,
    );
    const explicit = await resolveMetaLeads({
      status: [META_LEAD_STATUS.SKIPPED],
    });
    assert(
      !wide.some((r) => explicit.some((e) => e.sourceId === r.sourceId)),
      "a skipped lead is in the default audience",
    );
    return `${row.count} skipped-with-email in the table, none of them included`;
  });

  /* ── 2. the phone-only case the preview has to explain ─────────────────── */

  console.log("\n── phone-only leads: counted, never mailed ──");

  const donor = await MetaLead.findOne({ where: { email: { [Op.ne]: null } } });

  await check("seed one phone-only lead", async () => {
    assert(donor, "no meta lead to copy the shape from");
    const seeded = await MetaLead.create({
      accountId: donor.accountId,
      metaLeadId: MARKER,
      pageId: donor.pageId,
      formId: donor.formId,
      formName: donor.formName,
      campaignId: donor.campaignId,
      campaignName: donor.campaignName,
      adsetId: donor.adsetId,
      adsetName: donor.adsetName,
      adId: donor.adId,
      adName: donor.adName,
      name: "Phone Only Tester",
      email: null,
      phone: "9999999999",
      countryCode: "+91",
      source: donor.source,
      subSource: donor.subSource,
      status: META_LEAD_STATUS.NEW,
      sourceCreatedAt: donor.sourceCreatedAt,
      importedVia: donor.importedVia,
      fields: {},
      rawPayload: {},
    });
    seededLeadId = seeded.id;
    return `id ${seeded.id}`;
  });

  await check("countUnemailableMetaLeads sees it", async () => {
    const n = await countUnemailableMetaLeads({});
    assert(n >= 1, `counted ${n}`);
    return `${n} unemailable`;
  });

  await check("…and the resolver still does not", async () => {
    const rows = await resolveMetaLeads({});
    assert(
      !rows.some((r) => r.sourceId === seededLeadId),
      "a lead with no email was resolved as a recipient",
    );
    assert(
      rows.length === wide.length,
      `the audience changed size: ${rows.length} vs ${wide.length}`,
    );
    return `still ${rows.length} people`;
  });

  await check("the count honours the same filters as the resolver", async () => {
    const matching = await countUnemailableMetaLeads({ formId: [donor.formId] });
    const notMatching = await countUnemailableMetaLeads({
      formId: ["000-no-such-form"],
    });
    assert(matching >= 1, `matching filter counted ${matching}`);
    assert(notMatching === 0, `non-matching filter counted ${notMatching}`);
    return `${matching} on its own form, 0 elsewhere`;
  });

  /* ── 3. saving a campaign with the clause the selector writes ──────────── */

  console.log("\n── the clause the selector stores, through save and preview ──");

  // Exactly the shape AudienceSelector writes: the drill-down's arrays plus
  // the inline chips, with no empty keys. Scoped to the donor's form so the
  // seeded phone-only lead is inside the filter set.
  const clause = {
    type: CAMPAIGN_SOURCE_TYPE.META_LEADS,
    filters: {
      formId: [donor.formId],
      status: [META_LEAD_STATUS.NEW],
    },
  };

  await check("the source type is registered", () => {
    assert(
      isSupportedSourceType(CAMPAIGN_SOURCE_TYPE.META_LEADS),
      "not supported",
    );
    assert(
      typeof RESOLVERS[CAMPAIGN_SOURCE_TYPE.META_LEADS] === "function",
      "no resolver in the registry",
    );
    return "vocabulary and implementation agree";
  });

  await check("a campaign saves with it", async () => {
    const campaign = await Campaign.create({
      name: `[itest] Facebook audience ${Date.now()}`,
      subject: "itest",
      body: "<p>itest</p>",
      recipientFilters: { include: [clause], exclude: [] },
    });
    seededCampaignId = campaign.id;
    const reloaded = await Campaign.findByPk(campaign.id);
    assert(
      reloaded.recipientFilters.include[0].filters.formId[0] === donor.formId,
      "the filters did not round-trip through JSONB",
    );
    return `campaign ${campaign.id}`;
  });

  await check("buildRecipients resolves it", async () => {
    const { recipients, stats } = await buildRecipients({
      include: [clause],
      exclude: [],
    });
    const stat = stats.include.find(
      (s) => s.type === CAMPAIGN_SOURCE_TYPE.META_LEADS,
    );
    assert(stat, "no per-source stat for metaLeads");
    assert(recipients.length > 0, "resolved nobody");
    return `${stat.rows} rows → ${stat.unique} people`;
  });

  const previewRes = await run(previewRecipients, {
    params: { id: seededCampaignId },
    query: {},
  });

  await check("the preview answers 200", () => {
    assert(previewRes.statusCode === 200, `got ${previewRes.statusCode}`);
    return "";
  });

  await check("totals.unemailable is present and non-zero", () => {
    const totals = previewRes.body?.data?.totals;
    assert(totals, "no totals block");
    assert(
      typeof totals.unemailable === "number",
      `unemailable is ${typeof totals.unemailable}`,
    );
    assert(totals.unemailable >= 1, `unemailable is ${totals.unemailable}`);
    return `${totals.unemailable} phone-only`;
  });

  await check("the preview's arithmetic still adds up", () => {
    const totals = previewRes.body.data.totals;
    assert(
      totals.mailable ===
        totals.uniquePeople - totals.excluded - totals.suppressed,
      `mailable ${totals.mailable} ≠ ${totals.uniquePeople} - ${totals.excluded} - ${totals.suppressed}`,
    );
    return `${totals.rowsMatched} rows, ${totals.uniquePeople} unique, ${totals.suppressed} unsubscribed, ${totals.mailable} mailable`;
  });

  await check("the breakdown names the source", () => {
    const row = previewRes.body.data.breakdown.include.find(
      (s) => s.type === CAMPAIGN_SOURCE_TYPE.META_LEADS,
    );
    assert(row, "metaLeads missing from the breakdown");
    return `${row.rows} rows, ${row.unique} unique`;
  });

  await check("every previewed recipient is a Facebook lead", () => {
    const rows = previewRes.body.data.recipients;
    assert(rows.length > 0, "no sample recipients");
    for (const r of rows) {
      assert(
        r.sourceType === CAMPAIGN_SOURCE_TYPE.META_LEADS,
        `a ${r.sourceType} recipient came back`,
      );
      assert(r.email, "a recipient with no email reached the preview");
    }
    return `${rows.length} sampled, all metaLeads`;
  });

  /* ── 4. alongside the other sources ────────────────────────────────────── */

  console.log("\n── mixed with other sources ──");

  await check(
    "dedupes against website leads rather than double-counting",
    async () => {
      const meta = await buildRecipients({
        include: [{ type: CAMPAIGN_SOURCE_TYPE.META_LEADS, filters: {} }],
        exclude: [],
      });
      const web = await buildRecipients({
        include: [{ type: CAMPAIGN_SOURCE_TYPE.LEADS, filters: {} }],
        exclude: [],
      });
      const both = await buildRecipients({
        include: [
          { type: CAMPAIGN_SOURCE_TYPE.META_LEADS, filters: {} },
          { type: CAMPAIGN_SOURCE_TYPE.LEADS, filters: {} },
        ],
        exclude: [],
      });

      assert(
        both.recipients.length <=
          meta.recipients.length + web.recipients.length,
        "the union is bigger than the sum of its parts",
      );

      const emails = both.recipients.map((r) => r.email);
      assert(
        new Set(emails).size === emails.length,
        "a duplicate address survived",
      );

      const overlap =
        meta.recipients.length + web.recipients.length - both.recipients.length;
      return `${meta.recipients.length} Facebook + ${web.recipients.length} website → ${both.recipients.length} (${overlap} in both)`;
    },
  );

  await check("works on the exclude side", async () => {
    const without = await buildRecipients({
      include: [{ type: CAMPAIGN_SOURCE_TYPE.META_LEADS, filters: {} }],
      exclude: [
        {
          type: CAMPAIGN_SOURCE_TYPE.META_LEADS,
          filters: { formId: [aForm.id] },
        },
      ],
    });
    const form = await resolveMetaLeads({ formId: [aForm.id] });
    assert(
      without.recipients.length < wide.length,
      "excluding a form removed nobody",
    );
    for (const r of without.recipients) {
      assert(
        !form.some((f) => f.email.toLowerCase() === r.email),
        "somebody from the excluded form is still in the audience",
      );
    }
    return `${wide.length} − ${form.length} from that form → ${without.recipients.length}`;
  });

  /* ── 5. the picker's other half still works ────────────────────────────── */

  console.log("\n── regression: the rest of the dialog ──");

  const sourcesRes = await run(listAudienceSources, { query: {} });

  await check("GET /campaigns/sources still answers", () => {
    assert(sourcesRes.statusCode === 200, `got ${sourcesRes.statusCode}`);
    const data = sourcesRes.body.data;
    for (const key of [
      "leads",
      "resources",
      "events",
      "freeCourses",
      "subscribers",
      "campaigns",
      "contactLists",
    ]) {
      assert(data[key], `${key} missing`);
    }
    return `${data.supportedSourceTypes.length} supported source types`;
  });

  await check("metaLeads is advertised as supported", () => {
    assert(
      sourcesRes.body.data.supportedSourceTypes.includes(
        CAMPAIGN_SOURCE_TYPE.META_LEADS,
      ),
      "not in supportedSourceTypes",
    );
    return "";
  });

  await check("a static-list workflow may be published with it", () => {
    const result = validateWorkflow({
      triggerType: "staticList",
      triggerConfig: { recipientFilters: { include: [clause], exclude: [] } },
      definition: {
        nodes: [
          {
            id: "n1",
            type: "sendEmail",
            data: { subject: "x", body: "y", senderEmail: "a@b.c" },
          },
        ],
        edges: [],
      },
    });
    const audienceErrors = result.errors.filter((e) => /audience/i.test(e));
    assert(!audienceErrors.length, audienceErrors.join("; "));
    return "audience accepted";
  });
} finally {
  if (seededLeadId) {
    await MetaLead.destroy({ where: { id: seededLeadId }, force: true });
    console.log(`\n  cleaned up seeded lead ${seededLeadId}`);
  }
  if (seededCampaignId) {
    await Campaign.destroy({ where: { id: seededCampaignId }, force: true });
    console.log(`  cleaned up seeded campaign ${seededCampaignId}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
