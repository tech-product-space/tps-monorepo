import psEnv from "@ps/env/gradient";
/**
 * End-to-end walkthrough of what the admin panel actually does, over HTTP.
 *
 *   node src/test/panelFlow.itest.js
 *
 * The other suites test units and endpoints in isolation. This one drives the
 * exact sequence a person clicking through the panel produces — create, pick a
 * sender, build an audience from all four offered sources, preview, send a
 * test, schedule, cancel, duplicate — and checks the campaign is in the state
 * the screen would be showing after each step.
 *
 * **Nothing is ever actually mailed.** Agenda is disabled before the first
 * import, the mail transport is stubbed, and the one scheduled send is
 * cancelled rather than allowed to fire.
 *
 * Fixtures are namespaced `zz-panel-itest` and deleted at the end.
 */

// Must precede every other import: with jobs enabled, importing the send job
// turns this process into a live worker against the real queue.
psEnv.AGENDA_JOBS_ENABLED = "false";

const { Op } = await import("sequelize");

const db = (await import("../database/postgres/models/index.js")).default;
const { default: app } = await import("../app.js");
const { generateToken } = await import("../util/jwt.util.js");
// `getTransporters` is not re-exported by the barrel — take both from the
// manager, as campaignSend.itest.js does.
const { initEmailProviders, getTransporters } = await import(
  "../services/email/emailManager.js"
);
const { EMAIL_PROVIDER_ID } = await import(
  "../services/email/config/constants.js"
);
const { CAMPAIGN_STATUS } = await import("../config/constants/campaign.js");
const { SUBSCRIBER_SOURCE, SUBSCRIBER_STATUS } = await import(
  "../config/constants/subscriber.js"
);
const { EVENT_ATTENDEE_TYPE, EVENT_GUEST_STATUS } = await import(
  "../config/constants/eventGuest.js"
);

const {
  Campaign,
  CampaignRecipient,
  Contact,
  ContactList,
  Event,
  EventGuest,
  Lead,
  Resource,
  ResourceLead,
  Subscriber,
} = db;

const TAG = "zz-panel-itest";
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
  check(
    name,
    ok,
    ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

/**
 * Every send goes here instead of to a mail provider.
 *
 * Stubbed on each **transporter**, not on the `sendMail` export — ESM module
 * namespaces are frozen, so assigning to the export throws. Same approach as
 * `campaignSend.itest.js`.
 */
const mailbox = [];

initEmailProviders();

const providers = getTransporters();
if (!providers.length) throw new Error("no email providers configured");

for (const provider of providers) {
  provider.transporter.sendMail = async (payload) => {
    mailbox.push({ ...payload, sender: provider.email });
    return { messageId: `stub-${mailbox.length}` };
  };
}

const ids = {};

async function cleanup() {
  await CampaignRecipient.destroy({
    where: { email: { [Op.like]: `${TAG}-%` } },
  });
  await Campaign.destroy({ where: { name: { [Op.like]: `${TAG}%` } } });
  await Contact.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
  await ContactList.destroy({ where: { name: { [Op.like]: `${TAG}%` } } });
  await Lead.destroy({ where: { source: { [Op.like]: `${TAG}%` } } });
  await ResourceLead.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
  await Resource.destroy({ where: { title: { [Op.like]: `${TAG}%` } } });
  await EventGuest.destroy({ where: { name: { [Op.like]: `${TAG}%` } } });
  await Event.destroy({ where: { eventTitle: { [Op.like]: `${TAG}%` } } });
  await Subscriber.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
}

async function seed() {
  await Lead.bulkCreate([
    { name: "Lead A", email: mail("lead-a"), source: `${TAG}-brochure`, subSource: `${TAG}-ai`, status: "new" },
    { name: "Lead B", email: mail("lead-b"), source: `${TAG}-brochure`, subSource: `${TAG}-pm`, status: "new" },
    { name: "Lead C", email: mail("lead-c"), source: `${TAG}-callback`, status: "new" },
  ]);

  const resource = await Resource.create({
    title: `${TAG}-playbook`,
    resourceType: "Ebook",
    resourceCategory: "Product",
    resourceSlug: `${TAG}-playbook-slug`,
  });
  ids.resourceId = resource.id;

  await ResourceLead.bulkCreate([
    { resourceId: resource.id, name: "Downloader", email: mail("dl"), jobTitle: "PM" },
    // Same person twice: rows are not people, and the preview must say so.
    { resourceId: resource.id, name: "Downloader", email: mail("dl"), jobTitle: "PM" },
  ]);

  const event = await Event.create({
    eventTitle: `${TAG}-workshop`,
    eventType: "Workshop",
    eventCategory: "Normal",
    eventSlug: `${TAG}-workshop-slug`,
  });
  ids.eventId = event.id;

  await EventGuest.bulkCreate([
    { eventId: event.id, name: `${TAG}-guest-ok`, email: mail("guest-ok"), phone: "1", status: EVENT_GUEST_STATUS.APPROVED, attendeeType: EVENT_ATTENDEE_TYPE.PROFESSIONAL },
    { eventId: event.id, name: `${TAG}-guest-wait`, email: mail("guest-wait"), phone: "2", status: EVENT_GUEST_STATUS.WAITLISTED, attendeeType: EVENT_ATTENDEE_TYPE.STUDENT },
  ]);

  // Somebody who opted out and also appears in the lead list.
  await Subscriber.create({
    email: mail("lead-c"),
    source: SUBSCRIBER_SOURCE.CAMPAIGN_UNSUBSCRIBE,
    status: SUBSCRIBER_STATUS.UNSUBSCRIBED,
    unsubscribedAt: new Date(),
  });
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

const api = async (path, options = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      ...(options.headers || {}),
    },
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty body is fine */
  }

  return { status: res.status, body };
};

const uploadCsv = async (path, csv) => {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "list.csv");

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form,
  });

  return { status: res.status, body: await res.json() };
};

try {
  await cleanup();
  await seed();

  /* ═══════════════════════════════════════════════════════════════════════
     1. Contacts tab — create a list and upload to it
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== 1. upload a contact list ===\n");

  {
    const { status, body } = await api("/contacts/lists", {
      method: "POST",
      body: JSON.stringify({ name: `${TAG}-summit`, description: "badge scans" }),
    });
    eq("create list", status, 201);
    ids.listId = body.data.id;
  }

  {
    const csv = [
      "Full Name,Email Address,Mobile,Company",
      `Cara,${mail("cara")},111,Acme`,
      `Dan,${mail("dan")},222,Globex`,
      `Dupe,${mail("cara")},333,Acme`,
      `Broken,not-an-email,444,Nowhere`,
    ].join("\n");

    const { status, body } = await uploadCsv(
      `/contacts/lists/${ids.listId}/upload`,
      csv,
    );

    eq("upload accepted", status, 200);
    eq("  ...two people created from aliased headers", body.data.created, 2);
    eq("  ...in-file duplicate skipped", body.data.skipped, 1);
    eq("  ...bad address reported", body.data.invalid, 1);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     2. Campaigns tab — create, then fill the four editor cards
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== 2. build the campaign ===\n");

  {
    const { status, body } = await api("/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: `${TAG}-launch` }),
    });
    eq("create campaign", status, 201);
    eq("  ...starts as a draft", body.data.status, CAMPAIGN_STATUS.DRAFT);
    ids.campaignId = body.data.id;
  }

  {
    const { body } = await api("/campaigns/senders");
    check("sender list is offered", body.data.length > 0);
    check(
      "  ...and every one is a configured provider",
      body.data.every((s) => Object.values(EMAIL_PROVIDER_ID).includes(s.email)),
    );
  }

  {
    // Sender card
    const { status } = await api(`/campaigns/${ids.campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({
        senderEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
        senderName: "Gradient Panel Test",
      }),
    });
    eq("sender saved", status, 200);
  }

  {
    // An address SES has no provider for must not be storable.
    const { status } = await api(`/campaigns/${ids.campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({ senderEmail: "nobody@example.com" }),
    });
    eq("an unverified sender is refused", status, 400);
  }

  {
    // Subject + body cards
    const { status } = await api(`/campaigns/${ids.campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({
        subject: "Hello {{name}}",
        body: '<p>Hi {{name}}</p><p><a href="https://thegradient.co.in/courses">Have a look</a></p>',
      }),
    });
    eq("subject and body saved", status, 200);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     3. The audience selector — all four offered sources at once
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== 3. the audience selector ===\n");

  {
    const { body } = await api("/campaigns/sources");
    const data = body.data;

    // Everything the four panels render off.
    check(
      "the selector's four sources are all resolvable",
      ["leads", "resourceLeads", "eventGuests", "contactLists"].every((t) =>
        data.supportedSourceTypes.includes(t),
      ),
    );

    const mine = data.leads.sources.find((s) => s.source === `${TAG}-brochure`);
    check("lead sources come back", Boolean(mine));
    eq(
      "  ...with their sub-sources nested, as the panel groups them",
      mine?.subSources?.map((s) => s.subSource).sort(),
      [`${TAG}-ai`, `${TAG}-pm`],
    );

    const event = data.events.items.find((e) => e.id === ids.eventId);
    eq("event picker shows guest counts", event?.totalGuests, 2);

    const resource = data.resources.items.find((r) => r.id === ids.resourceId);
    eq("resource picker shows downloads", resource?.downloads, 2);
    eq("  ...and people separately", resource?.people, 1);

    const list = data.contactLists.items.find((l) => l.id === ids.listId);
    eq("contact list picker shows the list size", list?.contactCount, 2);
  }

  {
    // Exactly what "Apply" writes: four include clauses, exclude untouched.
    const { status } = await api(`/campaigns/${ids.campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({
        recipientFilters: {
          include: [
            { type: "leads", filters: { source: [`${TAG}-brochure`], subSource: [] } },
            { type: "resourceLeads", filters: { resourceId: [ids.resourceId] } },
            {
              type: "eventGuests",
              filters: {
                eventFilters: {
                  [ids.eventId]: { status: EVENT_GUEST_STATUS.APPROVED },
                },
              },
            },
            { type: "contactLists", filters: { contactListId: [ids.listId] } },
          ],
          exclude: [],
        },
      }),
    });
    eq("audience saved", status, 200);
  }

  {
    // Sub-source narrowing, the one bit of the leads panel with real logic.
    const { body } = await api(`/campaigns/${ids.campaignId}`);
    const leads = body.data.recipientFilters.include.find(
      (c) => c.type === "leads",
    );
    eq("the lead clause round-trips", leads?.filters?.source, [`${TAG}-brochure`]);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4. Preview page
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== 4. preview ===\n");

  {
    const { status, body } = await api(
      `/campaigns/${ids.campaignId}/preview?page=1&limit=50`,
    );
    const t = body.data.totals;

    eq("preview resolves", status, 200);

    // leads A+B, downloader (×2 rows), approved guest, cara, dan = 7 rows
    eq("records matched counts rows", t.rowsMatched, 7);
    eq("  ...unique people is fewer", t.uniquePeople, 6);
    eq("  ...nobody excluded", t.excluded, 0);
    eq("  ...and nobody suppressed here", t.suppressed, 0);
    eq("  ...so six are mailable", t.mailable, 6);

    eq("all four sources contributed", body.data.breakdown.include.length, 4);

    const resourceStat = body.data.breakdown.include.find(
      (s) => s.type === "resourceLeads",
    );
    eq("the duplicated download is two rows", resourceStat.rows, 2);
    eq("  ...but one person", resourceStat.unique, 1);

    check(
      "the waitlisted guest is not included",
      !body.data.recipients.some((r) => r.email === mail("guest-wait")),
    );
    check(
      "the contact list's people are",
      body.data.recipients.some((r) => r.email === mail("cara")),
    );
  }

  {
    // Add the unsubscribed person's source and confirm they are removed.
    await api(`/campaigns/${ids.campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({
        recipientFilters: {
          include: [
            { type: "leads", filters: { source: [`${TAG}-brochure`, `${TAG}-callback`] } },
            { type: "contactLists", filters: { contactListId: [ids.listId] } },
          ],
          exclude: [],
        },
      }),
    });

    const { body } = await api(`/campaigns/${ids.campaignId}/preview`);
    eq("an unsubscribed person is resolved", body.data.totals.uniquePeople, 5);
    eq("  ...then suppressed", body.data.totals.suppressed, 1);
    eq("  ...leaving four mailable", body.data.totals.mailable, 4);
    check(
      "  ...and never appears in the list",
      !body.data.recipients.some((r) => r.email === mail("lead-c")),
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     5. Test send — the button on the preview page
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== 5. test send ===\n");

  {
    mailbox.length = 0;

    const { status } = await api(`/campaigns/${ids.campaignId}/send-test`, {
      method: "POST",
      body: JSON.stringify({ to: mail("tester"), name: "tester person" }),
    });

    eq("test send accepted", status, 200);
    eq("  ...exactly one email", mailbox.length, 1);
    eq("  ...to the right address", mailbox[0].to, mail("tester"));
    check(
      "  ...with {{name}} substituted and capitalised",
      mailbox[0].subject === "Hello Tester Person",
      mailbox[0].subject,
    );
    check(
      "  ...carrying an unsubscribe link",
      mailbox[0].html.includes("/unsubscribe?token="),
    );
    check(
      "  ...and campaign UTMs on content links",
      mailbox[0].html.includes(`utm_campaign=${ids.campaignId}`),
    );
    check(
      "  ...but not on the unsubscribe link",
      !/unsubscribe\?token=[^"]*utm_/.test(mailbox[0].html),
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     6. The send panel — schedule, then cancel
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== 6. schedule and cancel ===\n");

  {
    // Exactly what the panel posts: a UTC ISO string from a local pick.
    const when = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { status, body } = await api(`/campaigns/${ids.campaignId}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt: when }),
    });

    eq("schedule accepted", status, 200);
    eq("  ...campaign is scheduled", body.data.status, CAMPAIGN_STATUS.SCHEDULED);
    eq(
      "  ...at the instant given, to the second",
      new Date(body.data.scheduledAt).toISOString().slice(0, 19),
      when.slice(0, 19),
    );
    eq("  ...and nothing was mailed", mailbox.length, 1);
  }

  {
    const { status } = await api(`/campaigns/${ids.campaignId}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt: "2020-01-01T00:00:00.000Z" }),
    });
    eq("a time in the past is refused", status, 400);
  }

  {
    const { status } = await api(`/campaigns/${ids.campaignId}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt: "not a date" }),
    });
    eq("an unparseable time is refused", status, 400);
  }

  {
    const { status, body } = await api(`/campaigns/${ids.campaignId}/cancel`, {
      method: "POST",
    });
    eq("cancel accepted", status, 200);

    const after = await Campaign.findByPk(ids.campaignId);
    eq("  ...back to draft", after.status, CAMPAIGN_STATUS.DRAFT);
    eq("  ...with the schedule cleared", after.scheduledAt, null);
    check("  ...and a message", Boolean(body.message));
  }

  {
    // Readiness is enforced server-side, not only by the editor's red crosses.
    const { body: created } = await api("/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: `${TAG}-empty` }),
    });
    ids.emptyId = created.data.id;

    const { status, body } = await api(`/campaigns/${ids.emptyId}/schedule`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    eq("an unfinished campaign cannot be sent", status, 400);
    check(
      "  ...and the response says what is missing",
      Array.isArray(body.data?.missing) && body.data.missing.length === 4,
      JSON.stringify(body.data?.missing),
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     7. Duplicate
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== 7. duplicate ===\n");

  {
    const { status, body } = await api(
      `/campaigns/${ids.campaignId}/duplicate`,
      { method: "POST", body: JSON.stringify({}) },
    );

    eq("duplicate accepted", status, 201);
    ids.copyId = body.data.id;

    eq("  ...content copied", body.data.subject, "Hello {{name}}");
    eq(
      "  ...audience copied",
      body.data.recipientFilters.include.length,
      2,
    );
    eq("  ...as a fresh draft", body.data.status, CAMPAIGN_STATUS.DRAFT);
  }

  {
    // The copy is independently editable, which is the whole point.
    const { status } = await api(`/campaigns/${ids.copyId}`, {
      method: "PATCH",
      body: JSON.stringify({ subject: "Changed on the copy" }),
    });
    eq("the copy is editable", status, 200);

    const original = await Campaign.findByPk(ids.campaignId);
    eq("  ...without touching the original", original.subject, "Hello {{name}}");
  }

  /* ═══════════════════════════════════════════════════════════════════════
     8. Locking, stats and delete
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== 8. locking, stats, delete ===\n");

  {
    await Campaign.update(
      { status: CAMPAIGN_STATUS.SENT, sentAt: new Date() },
      { where: { id: ids.copyId } },
    );

    const { status } = await api(`/campaigns/${ids.copyId}`, {
      method: "PATCH",
      body: JSON.stringify({ subject: "nope" }),
    });
    eq("a sent campaign cannot be edited", status, 400);

    const { status: dupStatus } = await api(
      `/campaigns/${ids.copyId}/duplicate`,
      { method: "POST", body: JSON.stringify({ name: `${TAG}-from-sent` }) },
    );
    eq("  ...but it can still be duplicated", dupStatus, 201);
  }

  {
    const { status, body } = await api(`/campaigns/${ids.copyId}/stats`);

    eq("stats load for a sent campaign", status, 200);
    check("  ...with an audience funnel", body.data.audience !== undefined);
    check("  ...delivery numbers", body.data.delivery !== undefined);
    check("  ...and grouped failures", Array.isArray(body.data.failures));
  }

  {
    const { status } = await api(`/campaigns/${ids.emptyId}`, {
      method: "DELETE",
    });
    eq("a draft can be deleted", status, 200);
  }

  {
    // The list the campaign still targets must not vanish under it.
    const { status, body } = await api(`/contacts/lists/${ids.listId}`, {
      method: "DELETE",
    });
    eq("a list used by a draft campaign is protected", status, 409);
    check(
      "  ...and the message names the campaign",
      /zz-panel-itest-launch/.test(body.message || ""),
      body.message,
    );
  }
} finally {
  await cleanup();

  const leftover =
    (await Campaign.count({ where: { name: { [Op.like]: `${TAG}%` } } })) +
    (await ContactList.count({ where: { name: { [Op.like]: `${TAG}%` } } })) +
    (await Contact.count({ where: { email: { [Op.like]: `${TAG}-%` } } })) +
    (await Lead.count({ where: { source: { [Op.like]: `${TAG}%` } } })) +
    (await Subscriber.count({ where: { email: { [Op.like]: `${TAG}-%` } } })) +
    (await Event.count({ where: { eventTitle: { [Op.like]: `${TAG}%` } } }));

  console.log(`\nfixtures left behind: ${leftover}`);
  console.log(`emails actually dispatched: 0 (transport stubbed)`);

  server.closeAllConnections?.();
  server.close();
  await db.sequelize.close();

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}
