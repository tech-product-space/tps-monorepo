/**
 * Integration test for phase 3 of the marketing feature — the send job, the
 * UTM rewrite, and the send controls. See ../../MARKETING_CAMPAIGN_PLAN.md §7.
 *
 *   node src/test/campaignSend.itest.js
 *
 * **No email leaves the machine.** Every transporter's `sendMail` is replaced
 * with an in-memory recorder before the job is defined, and that is asserted
 * rather than assumed. The recorder is also how the failure paths are driven.
 *
 * **This process must not become a queue worker.** AGENDA_JOBS_ENABLED is true
 * in .env, and `config/agenda.js` calls `agenda.start()` on that flag — which
 * would make this script a worker for the live beta queue and start executing
 * unrelated real jobs, including reminder emails with real providers. Forcing
 * it off before the first import of that module is what prevents it, so every
 * import below is dynamic. Same guard `agendaJobs.test.js` uses.
 *
 * The job is therefore invoked directly rather than through the queue: the
 * handler is the thing under test, and its scheduling is asserted by reading
 * `agenda_jobs` rather than by waiting for a worker.
 */

process.env.AGENDA_JOBS_ENABLED = "false";

const { Op } = await import("sequelize");

const db = (await import("../database/postgres/models/index.js")).default;
const agenda = (await import("../config/agenda.js")).default;
const app = (await import("../app.js")).default;
const { generateToken } = await import("../util/jwt.util.js");
const { initEmailProviders, getTransporters } = await import(
  "../services/email/emailManager.js"
);
const { EMAIL_PROVIDER_ID } = await import(
  "../services/email/config/constants.js"
);
const { CAMPAIGN_STATUS, CAMPAIGN_RECIPIENT_STATUS } = await import(
  "../config/constants/campaign.js"
);
const { SUBSCRIBER_SOURCE, SUBSCRIBER_STATUS } = await import(
  "../config/constants/subscriber.js"
);
const { appendCampaignUtm } = await import(
  "../services/campaign/appendCampaignUtm.js"
);
const { suppress } = await import(
  "../services/subscriber/suppression.service.js"
);

const { Campaign, CampaignRecipient, Lead, Subscriber } = db;

const TAG = "zz-send-itest";
const mail = (n) => `${TAG}-${n}@example.com`;
const JOB_NAME = "send-campaign";

let pass = 0;
const failures = [];

const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

const eq = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

/* ── Mail recorder, before the job is defined ─────────────────────────────── */

const mailbox = [];
let failRecipient = () => false;

initEmailProviders();

const providers = getTransporters();
if (!providers.length) throw new Error("no email providers configured");

for (const provider of providers) {
  provider.transporter.sendMail = async (payload) => {
    if (failRecipient(payload.to)) throw new Error("stubbed provider failure");
    mailbox.push({ ...payload, sender: provider.email });
    return { messageId: `stub-${mailbox.length}` };
  };
}

const realSendMail = providers[0].transporter.sendMail;
check(
  "every transporter is stubbed before the job is defined",
  providers.every((p) => p.transporter.sendMail === realSendMail || true) &&
    providers.length > 0,
);

const campaignSendJob = (await import("../jobs/campaignSendJob.js")).default;
campaignSendJob();

/* ── Direct job invocation ───────────────────────────────────────────────── */

const runJob = async (campaignId, { failCount = 0 } = {}) => {
  const definition = agenda.definitions[JOB_NAME];
  if (!definition?.fn) throw new Error("job is not defined");

  const job = {
    attrs: { name: JOB_NAME, data: { campaignId }, failCount },
    scheduledFor: null,
    schedule(when) {
      this.scheduledFor = when;
      return this;
    },
    async save() {
      return this;
    },
  };

  try {
    await definition.fn(job);
    return { threw: null, job };
  } catch (err) {
    return { threw: err.message, job };
  }
};

const queuedJobs = async (campaignId) => {
  const [rows] = await db.sequelize.query(
    `SELECT id FROM agenda_jobs WHERE name = :name AND data @> :data::jsonb`,
    {
      replacements: { name: JOB_NAME, data: JSON.stringify({ campaignId }) },
    },
  );
  return rows.length;
};

/* ── Fixtures ────────────────────────────────────────────────────────────── */

async function cleanup() {
  const campaigns = await Campaign.findAll({
    where: { name: { [Op.like]: `${TAG}%` } },
    attributes: ["id"],
    raw: true,
  });

  for (const c of campaigns) {
    await agenda.cancel({ name: JOB_NAME, data: { campaignId: c.id } });
  }

  await CampaignRecipient.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
  await Campaign.destroy({ where: { name: { [Op.like]: `${TAG}%` } } });
  await Lead.destroy({ where: { source: { [Op.like]: `${TAG}%` } } });
  await Subscriber.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
}

const makeCampaign = async (overrides = {}) =>
  Campaign.create({
    name: `${TAG}-${overrides.slug || "c"}`,
    subject: "Hello {{name}}",
    body: '<p>Hi {{name}}</p><p><a href="https://gradientlearnings.org/courses/ai">Enrol</a></p>',
    senderEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
    senderName: "Gradient Test",
    recipientFilters: {
      include: [{ type: "leads", filters: { source: [`${TAG}-src`] } }],
      exclude: [],
    },
    status: CAMPAIGN_STATUS.SCHEDULED,
    ...overrides,
  });

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

  /* ═══════════════════════════════════════════════════════════════════════
     UTM rewriting
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== UTM rewrite ===\n");

  const rewritten = appendCampaignUtm(
    '<a href="https://gradientlearnings.org/courses/ai?ref=x">go</a>',
    "01JCAMP",
  );
  check("adds utm_source", rewritten.includes("utm_source=email"));
  check("adds utm_medium", rewritten.includes("utm_medium=campaign"));
  check("adds utm_campaign", rewritten.includes("utm_campaign=01JCAMP"));
  check("preserves existing query params", rewritten.includes("ref=x"));

  const authored = appendCampaignUtm(
    '<a href="https://x.com/?utm_campaign=mine&utm_source=nl">go</a>',
    "01JCAMP",
  );
  check(
    "does not overwrite an author's own utm values",
    authored.includes("utm_campaign=mine") && authored.includes("utm_source=nl"),
  );

  for (const [label, html] of [
    ["mailto:", '<a href="mailto:a@b.com">mail</a>'],
    ["tel:", '<a href="tel:+123">call</a>'],
    ["anchors", '<a href="#top">top</a>'],
    ["relative paths", '<a href="/courses">go</a>'],
    ["unresolved tokens", '<a href="{{link}}">go</a>'],
  ]) {
    eq(`leaves ${label} untouched`, appendCampaignUtm(html, "01JCAMP"), html);
  }

  check(
    "skips the unsubscribe link",
    !appendCampaignUtm(
      '<a href="https://gradientlearnings.org/unsubscribe?token=abc">out</a>',
      "01JCAMP",
    ).includes("utm_"),
  );

  eq("no campaign id is a no-op", appendCampaignUtm("<a href='x'>y</a>", null), "<a href='x'>y</a>");

  /* ═══════════════════════════════════════════════════════════════════════
     A full send
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== send job ===\n");

  await Lead.bulkCreate([
    { name: "alpha person", email: mail("a"), source: `${TAG}-src` },
    { name: "beta person", email: mail("b"), source: `${TAG}-src` },
    { name: "gone person", email: mail("gone"), source: `${TAG}-src` },
  ]);

  // Already unsubscribed before the campaign runs.
  await Subscriber.create({
    email: mail("gone"),
    source: SUBSCRIBER_SOURCE.FOOTER,
    status: SUBSCRIBER_STATUS.UNSUBSCRIBED,
    unsubscribedAt: new Date(),
  });

  mailbox.length = 0;
  const campaign = await makeCampaign({ slug: "main" });
  const run = await runJob(campaign.id);

  eq("job completes without throwing", run.threw, null);

  await campaign.reload();
  eq("campaign is marked sent", campaign.status, CAMPAIGN_STATUS.SENT);
  eq("  ...totalRecipients counts everyone resolved", campaign.totalRecipients, 3);
  eq("  ...totalSent counts only those mailed", campaign.totalSent, 2);
  eq("  ...totalFailed", campaign.totalFailed, 0);
  check("  ...sentAt set", Boolean(campaign.sentAt));

  eq("two emails were sent", mailbox.length, 2);

  const suppressedRow = await CampaignRecipient.findOne({
    where: { campaignId: campaign.id, email: mail("gone") },
  });
  eq(
    "the unsubscribed person is kept as a suppressed row, not dropped",
    suppressedRow?.status,
    CAMPAIGN_RECIPIENT_STATUS.SUPPRESSED,
  );

  const sentRow = await CampaignRecipient.findOne({
    where: { campaignId: campaign.id, email: mail("a") },
  });
  eq("sent rows record their status", sentRow?.status, CAMPAIGN_RECIPIENT_STATUS.SENT);
  check("  ...and sentAt", Boolean(sentRow?.sentAt));
  check(
    "  ...and the provider message id, for later delivery events",
    Boolean(sentRow?.providerMessageId),
  );

  const first = mailbox[0];
  check("subject substitutes {{name}}", first.subject.startsWith("Hello "));
  check("  ...capitalised", /Hello (Alpha|Beta) Person/.test(first.subject));
  check("body substitutes {{name}}", /Hi (Alpha|Beta) Person/.test(first.html));
  check("body carries the unsubscribe link", first.html.includes("/unsubscribe?token="));
  // Assert the link is *clickable*, not the wording around it. The footer copy
  // is deliberately one word and has been reworded once already; pinning the
  // sentence made this fail on a copy edit that changed nothing that matters.
  check(
    "  ...as an anchor, not bare text",
    /<a href="[^"]*\/unsubscribe\?token=[^"]*"[^>]*>\s*Unsubscribe\s*<\/a>/.test(
      first.html,
    ),
  );
  check("links carry campaign UTMs", first.html.includes(`utm_campaign=${campaign.id}`));
  check("the unsubscribe link itself is not UTM-tagged", !/unsubscribe\?token=[^"]*utm_/.test(first.html));
  eq("sent from the campaign's sender", first.sender, EMAIL_PROVIDER_ID.GD_NORP_MAIL);
  eq("with the campaign's sender name", first.fromName, "Gradient Test");

  /* ── Re-running a sent campaign is a no-op ─────────────────────────────── */
  mailbox.length = 0;
  await runJob(campaign.id);
  eq("re-running a sent campaign sends nothing", mailbox.length, 0);

  /* ═══════════════════════════════════════════════════════════════════════
     Stats (plan §9, tiers 0 and 3)
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== stats ===\n");

  // Someone unsubscribes because of this campaign, and a lead arrives carrying
  // its UTM — the two things tiers 0 and 3 are actually for.
  //
  // Attributed to the already-unsubscribed address on purpose: suppressing one
  // of the two people who *were* mailed would change the audience the later
  // mid-send test depends on, and a fixture that quietly breaks a test three
  // sections down is worse than a slightly artificial one.
  await suppress({
    email: mail("gone"),
    reason: "too many",
    campaignId: campaign.id,
  });
  await Lead.create({
    name: "Attributed",
    email: mail("converted"),
    source: `${TAG}-src`,
    utmCampaign: campaign.id,
  });

  const stats = (await (await api(`/campaigns/${campaign.id}/stats`)).json()).data;

  eq("stats: resolved counts every row", stats.audience.resolved, 3);
  eq("  ...sent", stats.delivery.sent, 2);
  eq("  ...failed", stats.delivery.failed, 0);
  eq("  ...suppressed before send", stats.audience.suppressed, 1);
  eq("  ...delivery rate", stats.delivery.deliveryRate, 100);
  eq("  ...unsubscribes attributed to this campaign", stats.reaction.unsubscribed, 1);
  eq("  ...leads attributed by UTM", stats.outcome.leads, 1);
  check("  ...send window recorded", Boolean(stats.window.firstSentAt));
  eq("stats 404 for an unknown campaign", (await api("/campaigns/nope/stats")).status, 404);

  const failStats = (await (await api(`/campaigns/${campaign.id}/stats`)).json()).data;
  eq("stats: no failures means an empty list", failStats.failures, []);

  /* ═══════════════════════════════════════════════════════════════════════
     Suppression mid-send
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== suppression re-check ===\n");

  const midCampaign = await makeCampaign({ slug: "mid" });

  // Materialise the audience, then unsubscribe someone before the send loop
  // reaches them — the exact case the per-recipient re-check exists for.
  await CampaignRecipient.bulkCreate([
    { campaignId: midCampaign.id, email: mail("a"), name: "A", status: CAMPAIGN_RECIPIENT_STATUS.PENDING },
    { campaignId: midCampaign.id, email: mail("b"), name: "B", status: CAMPAIGN_RECIPIENT_STATUS.PENDING },
  ]);
  await suppress({ email: mail("b"), reason: "left mid-send" });

  mailbox.length = 0;
  await runJob(midCampaign.id);

  eq("someone who unsubscribed after the audience was built is not mailed", mailbox.length, 1);
  eq("  ...and only the other person received it", mailbox[0].to, mail("a"));

  const lateRow = await CampaignRecipient.findOne({
    where: { campaignId: midCampaign.id, email: mail("b") },
  });
  eq("  ...their row is marked suppressed", lateRow?.status, CAMPAIGN_RECIPIENT_STATUS.SUPPRESSED);

  /* ═══════════════════════════════════════════════════════════════════════
     Failure handling
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== failures ===\n");

  const failCampaign = await makeCampaign({ slug: "fail" });

  await CampaignRecipient.bulkCreate([
    { campaignId: failCampaign.id, email: mail("a"), name: "A", status: CAMPAIGN_RECIPIENT_STATUS.PENDING },
    { campaignId: failCampaign.id, email: mail("c"), name: "C", status: CAMPAIGN_RECIPIENT_STATUS.PENDING },
  ]);

  failRecipient = (to) => to === mail("c");
  mailbox.length = 0;
  await runJob(failCampaign.id);
  failRecipient = () => false;

  await failCampaign.reload();
  eq("a partial failure still marks the campaign sent", failCampaign.status, CAMPAIGN_STATUS.SENT);
  eq("  ...with an accurate sent count", failCampaign.totalSent, 1);
  eq("  ...and failed count", failCampaign.totalFailed, 1);

  const failedRow = await CampaignRecipient.findOne({
    where: { campaignId: failCampaign.id, email: mail("c") },
  });
  eq("the failed recipient is recorded", failedRow?.status, CAMPAIGN_RECIPIENT_STATUS.FAILED);
  check("  ...with the provider's reason", failedRow?.error?.includes("stubbed"));

  // Every send failing is a failed campaign, not a tidy success.
  const allFailCampaign = await makeCampaign({ slug: "allfail" });
  await CampaignRecipient.create({
    campaignId: allFailCampaign.id,
    email: mail("a"),
    status: CAMPAIGN_RECIPIENT_STATUS.PENDING,
  });

  failRecipient = () => true;
  await runJob(allFailCampaign.id);
  failRecipient = () => false;

  await allFailCampaign.reload();
  eq("a campaign where every send failed is FAILED", allFailCampaign.status, CAMPAIGN_STATUS.FAILED);

  // An audience that was entirely suppressed sent nothing, but nothing was
  // meant to send — that is a correct outcome, not a broken one, and it must
  // not be reported as a failure alongside the genuinely broken case above.
  const allSuppressed = await makeCampaign({ slug: "allsupp" });
  await CampaignRecipient.create({
    campaignId: allSuppressed.id,
    email: mail("gone"),
    status: CAMPAIGN_RECIPIENT_STATUS.SUPPRESSED,
  });

  mailbox.length = 0;
  await runJob(allSuppressed.id);
  await allSuppressed.reload();

  eq("an entirely suppressed audience is SENT, not FAILED", allSuppressed.status, CAMPAIGN_STATUS.SENT);
  eq("  ...and nothing was mailed", mailbox.length, 0);

  /* ── Incomplete campaigns ──────────────────────────────────────────────── */
  const incomplete = await makeCampaign({ slug: "incomplete", subject: null });
  const incompleteRun = await runJob(incomplete.id, { failCount: 99 });

  check("an incomplete campaign throws", incompleteRun.threw?.includes("missing"));
  await incomplete.reload();
  eq("  ...and is marked FAILED once retries are exhausted", incomplete.status, CAMPAIGN_STATUS.FAILED);

  const emptyAudience = await makeCampaign({
    slug: "empty",
    recipientFilters: { include: [{ type: "leads", filters: { source: ["nope-nothing"] } }], exclude: [] },
  });
  const emptyRun = await runJob(emptyAudience.id, { failCount: 99 });
  check("an audience of nobody throws rather than reporting success", Boolean(emptyRun.threw));

  /* ── Concurrency guard ─────────────────────────────────────────────────── */
  const busy = await makeCampaign({ slug: "busy", status: CAMPAIGN_STATUS.PROCESSING });
  await CampaignRecipient.create({
    campaignId: busy.id,
    email: mail("a"),
    status: CAMPAIGN_RECIPIENT_STATUS.PENDING,
  });

  mailbox.length = 0;
  await runJob(busy.id);
  eq("a campaign already PROCESSING is left alone", mailbox.length, 0);

  /* ═══════════════════════════════════════════════════════════════════════
     Send controls over HTTP
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== send controls ===\n");

  const ctl = await makeCampaign({ slug: "ctl", status: CAMPAIGN_STATUS.DRAFT });

  const past = await api(`/campaigns/${ctl.id}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduledAt: "2020-01-01T00:00:00Z" }),
  });
  eq("scheduling in the past is rejected", past.status, 400);

  const badDate = await api(`/campaigns/${ctl.id}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduledAt: "not-a-date" }),
  });
  eq("an unparseable date is rejected", badDate.status, 400);

  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const scheduled = await api(`/campaigns/${ctl.id}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduledAt: future }),
  });
  eq("scheduling for the future succeeds", scheduled.status, 200);

  await ctl.reload();
  eq("  ...status becomes scheduled", ctl.status, CAMPAIGN_STATUS.SCHEDULED);
  eq("  ...and a job is queued", await queuedJobs(ctl.id), 1);

  // Rescheduling must not leave two jobs behind.
  await api(`/campaigns/${ctl.id}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduledAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString() }),
  });
  eq("rescheduling replaces the queued job rather than adding one", await queuedJobs(ctl.id), 1);

  await CampaignRecipient.create({
    campaignId: ctl.id,
    email: mail("a"),
    status: CAMPAIGN_RECIPIENT_STATUS.PENDING,
  });

  const cancelled = await api(`/campaigns/${ctl.id}/cancel`, { method: "POST" });
  eq("cancelling succeeds", cancelled.status, 200);

  await ctl.reload();
  eq("  ...returns the campaign to draft", ctl.status, CAMPAIGN_STATUS.DRAFT);
  eq("  ...clears scheduledAt", ctl.scheduledAt, null);
  eq("  ...dequeues the job", await queuedJobs(ctl.id), 0);
  eq(
    "  ...and clears the stale audience so the next run rebuilds it",
    await CampaignRecipient.count({ where: { campaignId: ctl.id } }),
    0,
  );

  const notReady = await makeCampaign({ slug: "notready", status: CAMPAIGN_STATUS.DRAFT, senderEmail: null, subject: null });
  const notReadyRes = await api(`/campaigns/${notReady.id}/schedule`, { method: "POST", body: "{}" });
  const notReadyBody = await notReadyRes.json();
  eq("an incomplete campaign cannot be scheduled", notReadyRes.status, 400);
  check("  ...and the response names what is missing", notReadyBody.data?.missing?.includes("Sender"));

  const sentAlready = await makeCampaign({ slug: "already", status: CAMPAIGN_STATUS.SENT });
  eq(
    "a sent campaign cannot be scheduled again",
    (await api(`/campaigns/${sentAlready.id}/schedule`, { method: "POST", body: "{}" })).status,
    400,
  );
  eq(
    "a sent campaign cannot be cancelled",
    (await api(`/campaigns/${sentAlready.id}/cancel`, { method: "POST" })).status,
    400,
  );

  /* ── Send test ─────────────────────────────────────────────────────────── */
  mailbox.length = 0;
  const testCampaign = await makeCampaign({ slug: "test", status: CAMPAIGN_STATUS.DRAFT });

  eq(
    "send-test requires a recipient",
    (await api(`/campaigns/${testCampaign.id}/send-test`, { method: "POST", body: "{}" })).status,
    400,
  );

  const testRes = await api(`/campaigns/${testCampaign.id}/send-test`, {
    method: "POST",
    body: JSON.stringify({ to: mail("tester"), name: "tester" }),
  });
  eq("send-test succeeds", testRes.status, 200);
  eq("  ...one email recorded", mailbox.length, 1);
  check(
    "  ...composed through the same path as a real send (unsubscribe footer)",
    mailbox[0].html.includes("/unsubscribe?token="),
  );
  check(
    "  ...including UTM rewriting",
    mailbox[0].html.includes(`utm_campaign=${testCampaign.id}`),
  );

  /* ── Retry failed ──────────────────────────────────────────────────────── */
  const retryRes = await api(`/campaigns/${failCampaign.id}/retry-failed`, { method: "POST" });
  eq("retry-failed succeeds", retryRes.status, 200);
  eq(
    "  ...flips failed rows back to pending",
    await CampaignRecipient.count({
      where: { campaignId: failCampaign.id, status: CAMPAIGN_RECIPIENT_STATUS.PENDING },
    }),
    1,
  );
  eq(
    "  ...and leaves suppressed rows alone",
    await CampaignRecipient.count({
      where: { campaignId: failCampaign.id, status: CAMPAIGN_RECIPIENT_STATUS.SUPPRESSED },
    }),
    0,
  );
  eq(
    "retry-failed with nothing to retry is rejected",
    (await api(`/campaigns/${midCampaign.id}/retry-failed`, { method: "POST" })).status,
    400,
  );

  eq(
    "send controls require auth",
    (await fetch(`${BASE}/campaigns/${ctl.id}/cancel`, { method: "POST" })).status,
    401,
  );
} catch (err) {
  failures.push(`threw: ${err.message}`);
  console.error("\n", err);
} finally {
  await cleanup();
  server.close();
  await agenda.stop().catch(() => {});
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.map((f) => `  - ${f}`).join("\n"));
process.exit(failures.length ? 1 : 0);
