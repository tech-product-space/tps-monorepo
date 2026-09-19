/**
 * Integration test for phase 2 of the marketing feature — campaign CRUD,
 * the audience resolvers, include/exclude, and the preview.
 * See ../../MARKETING_CAMPAIGN_PLAN.md §4 and §6.
 *
 *   node src/test/campaign.itest.js
 *
 * Requires migrations 20260813120000 and 20260813120001.
 *
 * Seeds namespaced fixtures across leads, resources, events, users and
 * subscribers, exercises everything over HTTP and through the services, then
 * deletes it all. Imports app.js (not server.js) so no mail can be dispatched.
 */

import { Op } from "sequelize";

import app from "../app.js";
import db from "../database/postgres/models/index.js";
import { generateToken } from "../util/jwt.util.js";
import { buildRecipients } from "../services/campaign/buildRecipients.js";
import {
  CAMPAIGN_RECIPIENT_STATUS,
  CAMPAIGN_SOURCE_TYPE,
  CAMPAIGN_STATUS,
} from "../config/constants/campaign.js";
import { SUBSCRIBER_SOURCE, SUBSCRIBER_STATUS } from "../config/constants/subscriber.js";
import { EVENT_ATTENDEE_TYPE, EVENT_GUEST_STATUS } from "../config/constants/eventGuest.js";
import { USER_STATUS } from "../config/constants/user.js";

const {
  Campaign,
  CampaignRecipient,
  Lead,
  Resource,
  ResourceLead,
  Event,
  EventGuest,
  Subscriber,
  User,
} = db;

const TAG = "zz-campaign-itest";
const mail = (n) => `${TAG}-${n}@example.com`;

let pass = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const emailsOf = (recipients) => recipients.map((r) => r.email).sort();

const ids = {};

async function cleanup() {
  await CampaignRecipient.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
  await Campaign.destroy({ where: { name: { [Op.like]: `${TAG}%` } } });
  await Lead.destroy({ where: { source: { [Op.like]: `${TAG}%` } } });
  await ResourceLead.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
  await Resource.destroy({ where: { title: { [Op.like]: `${TAG}%` } } });
  await EventGuest.destroy({ where: { name: { [Op.like]: `${TAG}%` } } });
  await Event.destroy({ where: { eventTitle: { [Op.like]: `${TAG}%` } } });
  await Subscriber.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
  await User.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
}

async function seed() {
  // ── Leads: two distinct people, one duplicate of an existing address, one
  //    with no email at all (Lead.email is nullable — the guard must hold).
  await Lead.bulkCreate([
    { name: "Lead One", email: mail("lead1"), source: `${TAG}-brochure`, subSource: "ai", status: "new" },
    { name: "Lead Two", email: mail("lead2"), source: `${TAG}-brochure`, subSource: "pm", status: "converted" },
    { name: "Lead Dup", email: mail("lead1").toUpperCase(), source: `${TAG}-contact`, status: "new" },
    { name: "Lead NoMail", email: null, source: `${TAG}-brochure`, status: "new" },
  ]);

  // ── Resource + leads: the same person downloading twice, so rows ≠ people.
  const resource = await Resource.create({
    title: `${TAG}-resource`,
    resourceType: "Ebook",
    resourceCategory: "Product",
    tagPrimary: ["ai"],
    tagSecondary: ["analytics"],
    resourceSlug: `${TAG}-resource-slug`,
  });
  ids.resourceId = resource.id;

  await ResourceLead.bulkCreate([
    { resourceId: resource.id, name: "Downloader", email: mail("dl"), jobTitle: "PM" },
    { resourceId: resource.id, name: "Downloader", email: mail("dl"), jobTitle: "PM" },
    { resourceId: resource.id, name: "Other", email: mail("dl2"), jobTitle: "Designer" },
  ]);

  // ── Event with an approved and a waitlisted guest.
  const event = await Event.create({
    eventTitle: `${TAG}-event`,
    eventType: "Workshop",
    eventCategory: "Normal",
    eventSlug: `${TAG}-event-slug`,
  });
  ids.eventId = event.id;

  await EventGuest.bulkCreate([
    {
      eventId: event.id,
      name: `${TAG}-guest-approved`,
      email: mail("guest-approved"),
      phone: "1",
      attendeeType: EVENT_ATTENDEE_TYPE.PROFESSIONAL,
      status: EVENT_GUEST_STATUS.APPROVED,
    },
    {
      eventId: event.id,
      name: `${TAG}-guest-wait`,
      email: mail("guest-wait"),
      phone: "2",
      attendeeType: EVENT_ATTENDEE_TYPE.STUDENT,
      status: EVENT_GUEST_STATUS.WAITLISTED,
    },
  ]);

  // ── Subscribers: one active, one unsubscribed (the suppression case).
  await Subscriber.bulkCreate([
    { email: mail("sub-active"), source: SUBSCRIBER_SOURCE.FOOTER, status: SUBSCRIBER_STATUS.ACTIVE },
    { email: mail("sub-gone"), source: SUBSCRIBER_SOURCE.FOOTER, status: SUBSCRIBER_STATUS.UNSUBSCRIBED, unsubscribedAt: new Date() },
    // Also suppressed, and also a lead — so the preview must drop lead2.
    { email: mail("lead2"), source: SUBSCRIBER_SOURCE.CAMPAIGN_UNSUBSCRIBE, status: SUBSCRIBER_STATUS.UNSUBSCRIBED, unsubscribedAt: new Date() },
  ]);

  // ── Users: one active, one blocked.
  await User.bulkCreate([
    { fullName: "Active User", email: mail("user-active"), status: USER_STATUS.ACTIVE },
    { fullName: "Blocked User", email: mail("user-blocked"), status: USER_STATUS.BLOCKED },
  ]);

  // ── A previous campaign that already reached lead1 — the exclude case.
  const prior = await Campaign.create({ name: `${TAG}-prior`, status: CAMPAIGN_STATUS.SENT });
  ids.priorCampaignId = prior.id;

  await CampaignRecipient.bulkCreate([
    { campaignId: prior.id, email: mail("lead1"), name: "Lead One", status: CAMPAIGN_RECIPIENT_STATUS.SENT },
    { campaignId: prior.id, email: mail("dl"), name: "Downloader", status: CAMPAIGN_RECIPIENT_STATUS.FAILED },
  ]);
}

const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const BASE = `http://127.0.0.1:${server.address().port}`;

const adminToken = generateToken({
  id: "itest-admin",
  role: "Super Admin",
  name: "ITest",
  email: "itest@example.com",
});

const api = (path, options = {}) =>
  fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      ...(options.headers || {}),
    },
  });

try {
  await cleanup();
  await seed();

  /* ═══════════════════════════════════════════════════════════════════════
     Resolvers and buildRecipients
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== resolvers ===\n");

  const leadsOnly = await buildRecipients({
    include: [{ type: "leads", filters: { source: [`${TAG}-brochure`] } }],
  });
  eq(
    "leads resolver filters by source and drops the null-email row",
    emailsOf(leadsOnly.recipients),
    [mail("lead1"), mail("lead2")].sort(),
  );

  const byStatus = await buildRecipients({
    include: [{ type: "leads", filters: { source: [`${TAG}-brochure`], status: ["converted"] } }],
  });
  eq("leads resolver filters by status", emailsOf(byStatus.recipients), [mail("lead2")]);

  const byTag = await buildRecipients({
    include: [{ type: "resourceLeads", filters: { tags: ["analytics"] } }],
  });
  eq(
    "resource leads match a SECONDARY tag, not just the primary",
    emailsOf(byTag.recipients),
    [mail("dl"), mail("dl2")].sort(),
  );

  const byJobTitle = await buildRecipients({
    include: [{ type: "resourceLeads", filters: { resourceId: [ids.resourceId], jobTitle: ["Designer"] } }],
  });
  eq("resource leads filter by jobTitle", emailsOf(byJobTitle.recipients), [mail("dl2")]);

  const perEvent = await buildRecipients({
    include: [
      {
        type: "eventGuests",
        filters: { eventFilters: { [ids.eventId]: { status: EVENT_GUEST_STATUS.APPROVED } } },
      },
    ],
  });
  eq(
    "event guests honour a per-event status filter",
    emailsOf(perEvent.recipients),
    [mail("guest-approved")],
  );

  const noEvents = await buildRecipients({ include: [{ type: "eventGuests", filters: {} }] });
  eq("event guests with no event chosen resolve to nobody", noEvents.recipients.length, 0);

  const subs = await buildRecipients({
    include: [{ type: "subscribers", filters: { source: [SUBSCRIBER_SOURCE.FOOTER] } }],
  });
  check(
    "subscribers resolver never returns unsubscribed rows",
    !emailsOf(subs.recipients).includes(mail("sub-gone")),
    `got ${JSON.stringify(emailsOf(subs.recipients))}`,
  );

  // Even if a caller tries to ask for them explicitly.
  const subsForced = await buildRecipients({
    include: [{ type: "subscribers", filters: { status: SUBSCRIBER_STATUS.UNSUBSCRIBED } }],
  });
  check(
    "subscribers resolver ignores an attempt to target unsubscribed",
    !emailsOf(subsForced.recipients).includes(mail("sub-gone")),
  );

  const users = await buildRecipients({ include: [{ type: "users", filters: {} }] });
  const userEmails = emailsOf(users.recipients);
  check("users resolver includes active users", userEmails.includes(mail("user-active")));
  check("users resolver excludes blocked users", !userEmails.includes(mail("user-blocked")));

  const priorSent = await buildRecipients({
    include: [{ type: "campaignRecipients", filters: { campaignId: [ids.priorCampaignId] } }],
  });
  eq(
    "campaignRecipients defaults to sent only",
    emailsOf(priorSent.recipients),
    [mail("lead1")],
  );

  const noCampaign = await buildRecipients({
    include: [{ type: "campaignRecipients", filters: {} }],
  });
  eq("campaignRecipients with no campaign resolves to nobody", noCampaign.recipients.length, 0);

  /* ═══════════════════════════════════════════════════════════════════════
     Dedupe, include union, exclude
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== include / exclude ===\n");

  const union = await buildRecipients({
    include: [
      { type: "leads", filters: { source: [`${TAG}-brochure`, `${TAG}-contact`] } },
      { type: "resourceLeads", filters: { resourceId: [ids.resourceId] } },
    ],
  });

  eq(
    "union dedupes across and within sources",
    emailsOf(union.recipients),
    [mail("lead1"), mail("lead2"), mail("dl"), mail("dl2")].sort(),
  );
  check(
    "lead1 is deduped case-insensitively (LEAD1 vs lead1)",
    emailsOf(union.recipients).filter((e) => e === mail("lead1")).length === 1,
  );

  const resourceStat = union.stats.include.find((s) => s.type === "resourceLeads");
  eq("stats report rows matched (3 resource-lead rows)", resourceStat.rows, 3);
  eq("stats report unique people contributed (2)", resourceStat.unique, 2);

  const excluded = await buildRecipients({
    include: [{ type: "leads", filters: { source: [`${TAG}-brochure`] } }],
    exclude: [{ type: "campaignRecipients", filters: { campaignId: [ids.priorCampaignId] } }],
  });
  eq(
    "exclude subtracts people who already got the prior send",
    emailsOf(excluded.recipients),
    [mail("lead2")],
  );
  eq("stats count the exclusion", excluded.stats.excluded, 1);

  const excludeStat = excluded.stats.exclude[0];
  eq("exclude clause reports how many it actually removed", excludeStat.removed, 1);

  // A clause that resolves rows but removes nobody is the silent-typo case.
  const uselessExclude = await buildRecipients({
    include: [{ type: "leads", filters: { source: [`${TAG}-contact`] } }],
    exclude: [{ type: "users", filters: {} }],
  });
  eq("an exclusion that removes nobody reports removed: 0", uselessExclude.stats.exclude[0].removed, 0);

  const legacy = await buildRecipients({
    sources: [{ type: "leads", filters: { source: [`${TAG}-contact`] } }],
  });
  eq("TPS-style { sources } is read as include-only", emailsOf(legacy.recipients), [mail("lead1")]);

  // The split between the vocabulary (CAMPAIGN_SOURCE_TYPE) and the registry
  // is what makes this possible: a source with no resolver must be a named
  // error, not an empty audience. `contactLists` was the stand-in here until
  // phase 5 implemented it — any unknown string proves the same rule.
  let threw = null;
  try {
    await buildRecipients({ include: [{ type: "notARealSource", filters: {} }] });
  } catch (err) {
    threw = err.message;
  }
  check(
    "an unsupported source throws rather than resolving to nobody",
    threw?.includes("notARealSource"),
    `got ${threw}`,
  );

  /* ═══════════════════════════════════════════════════════════════════════
     CRUD over HTTP
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== campaign CRUD ===\n");

  eq("GET /campaigns requires auth", (await fetch(`${BASE}/campaigns`)).status, 401);

  const createRes = await api("/campaigns", {
    method: "POST",
    body: JSON.stringify({ name: `${TAG}-main` }),
  });
  const created = (await createRes.json()).data;
  ids.campaignId = created.id;

  eq("POST /campaigns creates", createRes.status, 201);
  eq("  ...starts as draft", created.status, CAMPAIGN_STATUS.DRAFT);
  // Compared field by field: Postgres JSONB sorts object keys, so the value
  // that comes back is `{exclude, include}` rather than the order it went in.
  eq("  ...with an empty include", created.recipientFilters.include, []);
  eq("  ...with an empty exclude", created.recipientFilters.exclude, []);

  const noName = await api("/campaigns", { method: "POST", body: JSON.stringify({}) });
  eq("POST /campaigns rejects a missing name", noName.status, 400);

  const list = await (await api("/campaigns?limit=100")).json();
  check("GET /campaigns lists it", list.data.some((c) => c.id === ids.campaignId));
  check("  ...omits the body column", !("body" in (list.data[0] || {})));
  check("  ...is paginated", typeof list.meta?.total === "number");

  eq("GET /campaigns/:id 404s for an unknown id", (await api("/campaigns/nope")).status, 404);

  const goodPatch = await api(`/campaigns/${ids.campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: "Hello {{name}}",
      body: "<p>Hi {{name}}</p>",
      senderEmail: "noreply@gradientlearnings.org",
      senderName: "Gradient",
      recipientFilters: {
        include: [{ type: "leads", filters: { source: [`${TAG}-brochure`] } }],
        exclude: [{ type: "campaignRecipients", filters: { campaignId: [ids.priorCampaignId] } }],
      },
    }),
  });
  eq("PATCH updates editable fields", goodPatch.status, 200);

  const patched = (await goodPatch.json()).data;
  eq("  ...subject stored", patched.subject, "Hello {{name}}");
  eq("  ...audience stored", patched.recipientFilters.include[0].type, "leads");

  // Fields owned by the send job.
  await api(`/campaigns/${ids.campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: CAMPAIGN_STATUS.SENT, totalSent: 9999, sentAt: new Date() }),
  });
  const untouched = await Campaign.findByPk(ids.campaignId);
  eq("PATCH cannot set status", untouched.status, CAMPAIGN_STATUS.DRAFT);
  eq("PATCH cannot set totalSent", untouched.totalSent, 0);
  eq("PATCH cannot set sentAt", untouched.sentAt, null);

  const badSender = await api(`/campaigns/${ids.campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({ senderEmail: "someone@random.com" }),
  });
  eq("PATCH rejects an unverified sender", badSender.status, 400);

  for (const [label, filters] of [
    ["an unsupported source", { include: [{ type: "nonsense" }] }],
    ["a non-array include", { include: "leads" }],
    ["a non-object clause", { include: ["leads"] }],
    ["non-object filters", { include: [{ type: "leads", filters: [] }] }],
  ]) {
    const res = await api(`/campaigns/${ids.campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({ recipientFilters: filters }),
    });
    eq(`PATCH rejects ${label}`, res.status, 400);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Preview
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== preview ===\n");

  const preview = (await (await api(`/campaigns/${ids.campaignId}/preview?limit=1`)).json()).data;

  // include: lead1 + lead2. exclude: lead1 (prior send). suppressed: lead2.
  eq("preview counts unique people before exclusion", preview.totals.uniquePeople, 2);
  eq("  ...excluded", preview.totals.excluded, 1);
  eq("  ...suppressed", preview.totals.suppressed, 1);
  eq("  ...mailable", preview.totals.mailable, 0);
  check("  ...reports a per-source breakdown", preview.breakdown.include.length === 1);

  // Widen the audience so there is something left to page through.
  await api(`/campaigns/${ids.campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({
      recipientFilters: {
        include: [{ type: "resourceLeads", filters: { resourceId: [ids.resourceId] } }],
        exclude: [],
      },
    }),
  });

  const paged = await (await api(`/campaigns/${ids.campaignId}/preview?limit=1&page=1`)).json();
  eq("preview paginates server-side", paged.data.recipients.length, 1);
  eq("  ...meta.total is the mailable count", paged.meta.total, 2);
  eq("  ...rows matched is larger than people", paged.data.totals.rowsMatched, 3);
  eq("  ...unique people", paged.data.totals.uniquePeople, 2);

  const page2 = await (await api(`/campaigns/${ids.campaignId}/preview?limit=1&page=2`)).json();
  check(
    "page 2 returns a different person",
    page2.data.recipients[0]?.email !== paged.data.recipients[0]?.email,
  );

  // A broken audience must be a 400 naming the source, not a 500.
  await Campaign.update(
    { recipientFilters: { include: [{ type: "notARealSource", filters: {} }], exclude: [] } },
    { where: { id: ids.campaignId } },
  );
  const brokenPreview = await api(`/campaigns/${ids.campaignId}/preview`);
  eq("preview 400s on an unsupported source", brokenPreview.status, 400);
  check(
    "  ...and names it",
    (await brokenPreview.json()).message?.includes("notARealSource"),
  );

  /* ═══════════════════════════════════════════════════════════════════════
     Duplicate
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== duplicate ===\n");

  {
    // Give the original something worth copying, and a send to *not* copy.
    await Campaign.update(
      {
        subject: "Original subject",
        body: "<p>Original body</p>",
        senderName: "Someone",
        recipientFilters: {
          include: [{ type: "leads", filters: { source: [`${TAG}-brochure`] } }],
          exclude: [],
        },
        status: CAMPAIGN_STATUS.SENT,
        sentAt: new Date(),
        totalRecipients: 99,
        totalSent: 98,
        totalFailed: 1,
      },
      { where: { id: ids.campaignId } },
    );

    const res = await api(`/campaigns/${ids.campaignId}/duplicate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const copy = (await res.json()).data;
    ids.copyId = copy?.id;

    eq("duplicate returns 201", res.status, 201);
    check("  ...a different campaign", copy?.id !== ids.campaignId);
    check("  ...named as a copy", /\(copy\)$/.test(copy?.name || ""));
    eq("  ...carries the subject", copy?.subject, "Original subject");
    eq("  ...carries the body", copy?.body, "<p>Original body</p>");
    eq("  ...carries the sender name", copy?.senderName, "Someone");
    eq(
      "  ...carries the audience query",
      copy?.recipientFilters?.include?.[0]?.type,
      "leads",
    );

    // A copy of a sent campaign is a draft, not a second record of that send.
    eq("  ...lands as a draft", copy?.status, CAMPAIGN_STATUS.DRAFT);
    eq("  ...with no sentAt", copy?.sentAt, null);
    eq("  ...and zeroed counters", [
      copy?.totalRecipients,
      copy?.totalSent,
      copy?.totalFailed,
    ], [0, 0, 0]);

    // The original is untouched.
    const original = await Campaign.findByPk(ids.campaignId);
    eq("the original stays sent", original.status, CAMPAIGN_STATUS.SENT);
    eq("  ...and keeps its counters", original.totalSent, 98);
  }

  {
    const res = await api(`/campaigns/${ids.campaignId}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ name: `${TAG}-renamed-copy` }),
    });
    const copy = (await res.json()).data;
    ids.namedCopyId = copy?.id;
    eq("a name can be supplied", copy?.name, `${TAG}-renamed-copy`);
  }

  {
    const res = await api("/campaigns/does-not-exist/duplicate", {
      method: "POST",
      body: JSON.stringify({}),
    });
    eq("duplicating an unknown campaign is a 404", res.status, 404);
  }

  {
    // Recipient rows belong to the send that produced them.
    const rows = await CampaignRecipient.count({
      where: { campaignId: ids.copyId },
    });
    eq("no recipient rows are copied", rows, 0);
  }

  // Put it back for the locking assertions below.
  await Campaign.update(
    { status: CAMPAIGN_STATUS.DRAFT, sentAt: null },
    { where: { id: ids.campaignId } },
  );

  /* ═══════════════════════════════════════════════════════════════════════
     Sources, senders, and the locked statuses
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== sources, senders, locking ===\n");

  const senders = await (await api("/campaigns/senders")).json();
  check(
    "GET /campaigns/senders lists verified identities only",
    senders.data.length > 0 && senders.data.every((s) => s.email.includes("@")),
  );

  const sources = (await (await api("/campaigns/sources")).json()).data;
  check("GET /campaigns/sources returns lead sources", Array.isArray(sources.leads.sources));
  check("  ...events", sources.events.items.some((e) => e.id === ids.eventId));
  check("  ...resources with derived types", sources.resources.types.includes("Ebook"));
  check("  ...derived tags from both tag columns", sources.resources.tags.includes("analytics"));
  check("  ...job titles", sources.resources.jobTitles.includes("Designer"));
  check("  ...past campaigns for the exclude side", sources.campaigns.items.length > 0);
  check(
    "  ...advertises only resolvable source types",
    sources.supportedSourceTypes.every((t) =>
      Object.values(CAMPAIGN_SOURCE_TYPE).includes(t),
    ),
  );
  check(
    "  ...and every source in the vocabulary is resolvable",
    sources.supportedSourceTypes.length ===
      Object.values(CAMPAIGN_SOURCE_TYPE).length,
  );

  for (const status of [CAMPAIGN_STATUS.PROCESSING, CAMPAIGN_STATUS.SENT]) {
    await Campaign.update({ status }, { where: { id: ids.campaignId } });

    const res = await api(`/campaigns/${ids.campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: `${TAG}-renamed` }),
    });
    eq(`PATCH is blocked while ${status}`, res.status, 400);
  }

  await Campaign.update({ status: CAMPAIGN_STATUS.PROCESSING }, { where: { id: ids.campaignId } });
  eq(
    "DELETE is blocked while processing",
    (await api(`/campaigns/${ids.campaignId}`, { method: "DELETE" })).status,
    400,
  );

  await Campaign.update({ status: CAMPAIGN_STATUS.SENT }, { where: { id: ids.campaignId } });
  eq(
    "DELETE is allowed once sent",
    (await api(`/campaigns/${ids.campaignId}`, { method: "DELETE" })).status,
    200,
  );

  // The FK is ON DELETE CASCADE — recipient rows must not outlive the campaign.
  await CampaignRecipient.create({
    campaignId: ids.priorCampaignId,
    email: mail("cascade"),
    status: CAMPAIGN_RECIPIENT_STATUS.SENT,
  });
  await api(`/campaigns/${ids.priorCampaignId}`, { method: "DELETE" });
  eq(
    "deleting a campaign cascades its recipient rows",
    await CampaignRecipient.count({ where: { campaignId: ids.priorCampaignId } }),
    0,
  );
} catch (err) {
  failures.push(`threw: ${err.message}`);
  console.error("\n", err);
} finally {
  await cleanup();
  server.close();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.map((f) => `  - ${f}`).join("\n"));
process.exit(failures.length ? 1 : 0);
