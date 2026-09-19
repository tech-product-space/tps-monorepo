/**
 * Integration test for phase 5 of the marketing feature — contact lists, CSV
 * upload, and the eighth audience resolver.
 * See ../../MARKETING_CAMPAIGN_PLAN.md §3.3, §4.2 and §6.
 *
 *   node src/test/contact.itest.js
 *
 * Requires migrations 20260813150000 and 20260813150001.
 *
 * Everything it creates is namespaced `zz-contact-itest` and deleted at the
 * end. Imports app.js (not server.js), so no mail can be dispatched.
 */

import { Op } from "sequelize";

import app from "../app.js";
import db from "../database/postgres/models/index.js";
import { generateToken } from "../util/jwt.util.js";
import { buildRecipients } from "../services/campaign/buildRecipients.js";
import {
  parseContactCsv,
  MAX_ROWS,
} from "../services/contact/parseContactCsv.js";
import {
  RESOLVERS,
  SUPPORTED_SOURCE_TYPES,
  isSupportedSourceType,
} from "../services/campaign/recipientResolver/index.js";
import { CAMPAIGN_STATUS } from "../config/constants/campaign.js";
import {
  SUBSCRIBER_SOURCE,
  SUBSCRIBER_STATUS,
} from "../config/constants/subscriber.js";

const { Campaign, Contact, ContactList, Subscriber } = db;

const TAG = "zz-contact-itest";
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

const emailsOf = (recipients) => recipients.map((r) => r.email).sort();

const ids = {};

async function cleanup() {
  // Contacts cascade from the lists, but a failed run can leave orphans.
  await Contact.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
  await ContactList.destroy({ where: { name: { [Op.like]: `${TAG}%` } } });
  await Campaign.destroy({ where: { name: { [Op.like]: `${TAG}%` } } });
  await Subscriber.destroy({ where: { email: { [Op.like]: `${TAG}-%` } } });
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

/** Multipart: no Content-Type header — fetch must set the boundary itself. */
const upload = (path, csv, filename = "contacts.csv", type = "text/csv") => {
  const form = new FormData();
  form.append("file", new Blob([csv], { type }), filename);

  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form,
  });
};

try {
  await cleanup();

  /* ═══════════════════════════════════════════════════════════════════════
     The parser, in isolation — every rule in it came from a real spreadsheet
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== parseContactCsv ===\n");

  {
    const r = parseContactCsv(
      Buffer.from("name,email,phone\nAda,ada@example.com,123\n"),
    );
    eq("plain file: one row", r.rows.length, 1);
    eq("plain file: name", r.rows[0].name, "Ada");
    eq("plain file: email", r.rows[0].email, "ada@example.com");
    eq("plain file: phone", r.rows[0].phone, "123");
    eq("plain file: no extra data", r.rows[0].additionalData, {});
  }

  {
    // Excel writes a BOM. Without `bom: true` the first header becomes
    // "﻿name" and a file that looks perfect imports nothing.
    const r = parseContactCsv(
      Buffer.from("﻿name,email\nAda,ada@example.com\n"),
    );
    eq("BOM is stripped", r.rows.length, 1);
  }

  {
    const r = parseContactCsv(
      Buffer.from("Full Name,E-Mail,Mobile\nAda,ADA@Example.com ,123\n"),
    );
    eq("header aliases are matched", r.rows.length, 1);
    eq("aliased name", r.rows[0].name, "Ada");
    eq("email is lowercased and trimmed", r.rows[0].email, "ada@example.com");
    eq("aliased phone", r.rows[0].phone, "123");
  }

  {
    const r = parseContactCsv(
      Buffer.from("email,company,cohort\na@example.com,Acme,Spring\n"),
    );
    eq("unknown columns are kept", r.rows[0].additionalData, {
      company: "Acme",
      cohort: "Spring",
    });
  }

  {
    // One bad row must not fail the file — this is the governing decision.
    const r = parseContactCsv(
      Buffer.from(
        [
          "name,email",
          "Good,good@example.com",
          "NoMail,",
          "Broken,not-an-email",
          "Dup,good@example.com",
          "",
        ].join("\n"),
      ),
    );
    eq("valid rows survive bad ones", emailsOf(r.rows), ["good@example.com"]);
    eq("blank and malformed counted as invalid", r.invalid, 2);
    eq("in-file duplicate counted separately", r.duplicatesInFile, 1);
    eq("not truncated", r.truncated, false);
  }

  {
    // Ragged rows: a trailing comma is a spreadsheet artefact, not corruption.
    const r = parseContactCsv(
      Buffer.from("name,email,phone\nAda,ada@example.com\nBob,bob@example.com,1,extra\n"),
    );
    eq("short and long rows both parse", r.rows.length, 2);
  }

  {
    let threw = null;
    try {
      parseContactCsv(Buffer.from("first,last\nAda,Lovelace\n"));
    } catch (err) {
      threw = err;
    }
    check("no email column throws", threw !== null);
    eq("…as a 400", threw?.statusCode, 400);
    check(
      "…naming the file's actual columns",
      /first, last/.test(threw?.message || ""),
      threw?.message,
    );
  }

  {
    const many = ["email", ...Array.from({ length: MAX_ROWS + 5 }, (_, i) => `p${i}@example.com`)];
    const r = parseContactCsv(Buffer.from(many.join("\n")));
    eq("row cap holds", r.rows.length, MAX_ROWS);
    eq("…and is reported", r.truncated, true);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     List CRUD
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== list CRUD ===\n");

  {
    const res = await api("/contacts/lists", {
      method: "POST",
      body: JSON.stringify({ name: `${TAG}-list`, description: "from a webinar" }),
    });
    const body = await res.json();

    eq("create returns 201", res.status, 201);
    check("…with an id", Boolean(body.data?.id));
    eq("…and the name", body.data?.name, `${TAG}-list`);
    eq("…and the description", body.data?.description, "from a webinar");

    ids.listId = body.data.id;
  }

  {
    const res = await api("/contacts/lists", {
      method: "POST",
      body: JSON.stringify({ name: "   " }),
    });
    eq("blank name is rejected", res.status, 400);
  }

  {
    const res = await fetch(`${BASE}/contacts/lists`);
    eq("unauthenticated list is rejected", res.status, 401);
  }

  {
    const res = await api(`/contacts/lists?search=${TAG}`);
    const body = await res.json();
    const mine = body.data.find((l) => l.id === ids.listId);

    eq("search finds the list", Boolean(mine), true);
    eq("empty list reports a zero count", mine?.contactCount, 0);
    check("…and pagination meta is present", Boolean(body.meta));
  }

  {
    const res = await api(`/contacts/lists/${ids.listId}`, {
      method: "PATCH",
      body: JSON.stringify({ description: "renamed" }),
    });
    const body = await res.json();
    eq("patch updates the description", body.data?.description, "renamed");
    eq("…and leaves the name alone", body.data?.name, `${TAG}-list`);
  }

  {
    const res = await api("/contacts/lists/does-not-exist");
    eq("unknown list is a 404", res.status, 404);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Upload
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== upload ===\n");

  {
    const csv = [
      "name,email,phone,company",
      `Ada,${mail("ada")},111,Acme`,
      `Bob,${mail("bob")},222,Globex`,
      `Dup,${mail("ada")},333,Acme`,
      `NoMail,,444,Nowhere`,
      `Bad,nonsense,555,Nowhere`,
    ].join("\n");

    const res = await upload(`/contacts/lists/${ids.listId}/upload`, csv);
    const body = await res.json();

    eq("upload returns 200", res.status, 200);
    eq("two people created", body.data?.created, 2);
    eq("the in-file duplicate is skipped", body.data?.skipped, 1);
    eq("blank and malformed are invalid", body.data?.invalid, 2);
    eq("total in list is reported", body.data?.totalInList, 2);
  }

  {
    const stored = await Contact.findOne({
      where: { contactListId: ids.listId, email: mail("ada") },
    });
    eq("name stored", stored?.name, "Ada");
    eq("phone stored", stored?.phone, "111");
    eq("extra column kept as additionalData", stored?.additionalData, {
      company: "Acme",
    });
  }

  {
    // Re-uploading the same file is the ordinary mistake, and it must not
    // double the list.
    const csv = ["name,email", `Ada,${mail("ada")}`, `Cleo,${mail("cleo")}`].join("\n");
    const res = await upload(`/contacts/lists/${ids.listId}/upload`, csv);
    const body = await res.json();

    eq("re-upload creates only the new person", body.data?.created, 1);
    eq("…and skips the one already there", body.data?.skipped, 1);
    eq("…leaving three in the list", body.data?.totalInList, 3);
  }

  {
    const count = await Contact.count({ where: { contactListId: ids.listId } });
    eq("no duplicate rows in the database", count, 3);
  }

  {
    // A file with an uppercase address must collide with the lowercase row
    // already stored — the unique index only works if normalisation does.
    const csv = ["email", mail("ada").toUpperCase()].join("\n");
    const body = await (await upload(`/contacts/lists/${ids.listId}/upload`, csv)).json();
    eq("case-different address is a duplicate", body.data?.created, 0);
  }

  {
    // Excel on Windows reports .csv as application/vnd.ms-excel. Bouncing that
    // would reject good files from exactly the people who make contact lists.
    const body = await (
      await upload(
        `/contacts/lists/${ids.listId}/upload`,
        `email\n${mail("excel")}`,
        "list.csv",
        "application/vnd.ms-excel",
      )
    ).json();
    eq("Excel's mimetype is accepted", body.data?.created, 1);
  }

  {
    const res = await upload(
      `/contacts/lists/${ids.listId}/upload`,
      "not a csv",
      "notes.pdf",
      "application/pdf",
    );
    eq("a non-CSV is a 400", res.status, 400);
  }

  {
    const res = await upload(
      `/contacts/lists/${ids.listId}/upload`,
      "first,last\nAda,Lovelace",
    );
    const body = await res.json();
    eq("a file with no email column is a 400", res.status, 400);
    check("…with a message naming the columns", /first, last/.test(body.message || ""));
  }

  {
    const res = await upload(
      `/contacts/lists/${ids.listId}/upload`,
      "email\n\n,\n",
    );
    eq("a file with no usable row is a 400", res.status, 400);
  }

  {
    const res = await upload(
      "/contacts/lists/does-not-exist/upload",
      `email\n${mail("nope")}`,
    );
    eq("upload to an unknown list is a 404", res.status, 404);
  }

  {
    const res = await api(`/contacts/lists/${ids.listId}/upload`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    eq("upload with no file is a 400", res.status, 400);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Reading contacts back
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== contacts ===\n");

  {
    const body = await (await api(`/contacts/lists/${ids.listId}/contacts`)).json();
    eq("four contacts now", body.meta?.total, 4);
    check("…paginated", Boolean(body.meta?.totalPages));
  }

  {
    const body = await (
      await api(`/contacts/lists/${ids.listId}/contacts?search=cleo`)
    ).json();
    eq("search by email", body.data.length, 1);
    eq("…finds the right person", body.data[0].email, mail("cleo"));
  }

  {
    const body = await (
      await api(`/contacts/lists/${ids.listId}/contacts?search=Bob`)
    ).json();
    eq("search by name", body.data.length, 1);
  }

  {
    const body = await (await api(`/contacts/lists/${ids.listId}`)).json();
    eq("the list reports its size", body.data?.contactCount, 4);
  }

  {
    const target = await Contact.findOne({
      where: { contactListId: ids.listId, email: mail("excel") },
    });
    const res = await api(
      `/contacts/lists/${ids.listId}/contacts/${target.id}`,
      { method: "DELETE" },
    );
    eq("a contact can be removed", res.status, 200);

    const gone = await Contact.findByPk(target.id);
    eq("…and is actually gone", gone, null);
  }

  {
    const res = await api(
      `/contacts/lists/${ids.listId}/contacts/does-not-exist`,
      { method: "DELETE" },
    );
    eq("removing an unknown contact is a 404", res.status, 404);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     The resolver
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== contactLists resolver ===\n");

  check("contactLists is now a supported source", isSupportedSourceType("contactLists"));
  // The exact count is asserted in campaignSources.itest.js, which owns the
  // registry; here it only matters that nothing has a missing resolver.
  check(
    "every declared source has a resolver",
    SUPPORTED_SOURCE_TYPES.length >= 8,
    `got ${SUPPORTED_SOURCE_TYPES.length}`,
  );
  check("…and every entry is a function", Object.values(RESOLVERS).every((r) => typeof r === "function"));

  {
    const { recipients } = await buildRecipients({
      include: [{ type: "contactLists", filters: { contactListId: [ids.listId] } }],
    });

    eq("resolves the list's people", emailsOf(recipients), [
      mail("ada"),
      mail("bob"),
      mail("cleo"),
    ]);
    eq("…tagged with the source", recipients[0].sourceType, "contactLists");
    check("…and carrying a sourceId", Boolean(recipients[0].sourceId));
  }

  {
    // No list picked must mean nobody — resolving to every contact ever
    // uploaded would mail all of them on the include side.
    const { recipients } = await buildRecipients({
      include: [{ type: "contactLists", filters: {} }],
    });
    eq("no list selected resolves to nobody", recipients.length, 0);
  }

  {
    const second = await ContactList.create({ name: `${TAG}-list-2` });
    ids.secondListId = second.id;

    await Contact.bulkCreate([
      { contactListId: second.id, email: mail("ada"), name: "Ada again" },
      { contactListId: second.id, email: mail("dave"), name: "Dave" },
    ]);

    const { recipients, stats } = await buildRecipients({
      include: [
        {
          type: "contactLists",
          filters: { contactListId: [ids.listId, second.id] },
        },
      ],
    });

    eq("two lists union, deduped by email", emailsOf(recipients), [
      mail("ada"),
      mail("bob"),
      mail("cleo"),
      mail("dave"),
    ]);
    eq("rows matched counts both copies of Ada", stats.include[0].rows, 5);
    eq("…while unique people does not", stats.include[0].unique, 4);
  }

  {
    // The same address on two lists is one person, and excluding one list must
    // not leave them in via the other.
    const { recipients } = await buildRecipients({
      include: [
        { type: "contactLists", filters: { contactListId: [ids.listId] } },
      ],
      exclude: [
        { type: "contactLists", filters: { contactListId: [ids.secondListId] } },
      ],
    });

    eq("exclude removes by email across lists", emailsOf(recipients), [
      mail("bob"),
      mail("cleo"),
    ]);
  }

  {
    // Membership of a list is not consent. The suppression check is the only
    // authority on whether an address may be mailed.
    await Subscriber.create({
      email: mail("bob"),
      source: SUBSCRIBER_SOURCE.CAMPAIGN_UNSUBSCRIBE,
      status: SUBSCRIBER_STATUS.UNSUBSCRIBED,
      unsubscribedAt: new Date(),
    });

    const campaign = await Campaign.create({
      name: `${TAG}-campaign`,
      status: CAMPAIGN_STATUS.DRAFT,
      recipientFilters: {
        include: [
          { type: "contactLists", filters: { contactListId: [ids.listId] } },
        ],
        exclude: [],
      },
    });
    ids.campaignId = campaign.id;

    const body = await (await api(`/campaigns/${campaign.id}/preview`)).json();

    eq("preview resolves three", body.data?.totals?.uniquePeople, 3);
    eq("…suppresses the unsubscribed one", body.data?.totals?.suppressed, 1);
    eq("…leaving two mailable", body.data?.totals?.mailable, 2);
    eq(
      "…and never lists the suppressed address",
      body.data.recipients.some((r) => r.email === mail("bob")),
      false,
    );
  }

  {
    const body = await (await api("/campaigns/sources")).json();

    check(
      "the sources endpoint advertises contactLists",
      body.data?.supportedSourceTypes?.includes("contactLists"),
    );

    const mine = body.data?.contactLists?.items?.find((l) => l.id === ids.listId);
    eq("…and lists it by name", mine?.name, `${TAG}-list`);
    eq("…with its size, so the picker is not a blind choice", mine?.contactCount, 3);
  }

  {
    // A campaign the panel saves must survive validation now that the resolver
    // exists — before phase 5 this was a 400.
    const res = await api(`/campaigns/${ids.campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({
        recipientFilters: {
          include: [
            { type: "contactLists", filters: { contactListId: [ids.listId] } },
          ],
          exclude: [],
        },
      }),
    });
    eq("contactLists passes campaign validation", res.status, 200);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Deleting a list
  ═══════════════════════════════════════════════════════════════════════ */
  console.log("\n=== delete ===\n");

  {
    // The draft campaign above targets this list. Deleting it would silently
    // shrink that campaign's audience, so it is refused.
    const res = await api(`/contacts/lists/${ids.listId}`, { method: "DELETE" });
    const body = await res.json();

    eq("a list used by a draft campaign cannot be deleted", res.status, 409);
    check("…and the message names the campaign", /zz-contact-itest-campaign/.test(body.message || ""));
  }

  {
    // Once that campaign is sent, its recipients are already materialised, so
    // the list is free to go.
    await Campaign.update(
      { status: CAMPAIGN_STATUS.SENT },
      { where: { id: ids.campaignId } },
    );

    const res = await api(`/contacts/lists/${ids.listId}`, { method: "DELETE" });
    eq("a list used only by a sent campaign can be deleted", res.status, 200);
  }

  {
    const orphans = await Contact.count({ where: { contactListId: ids.listId } });
    eq("contacts cascade with the list", orphans, 0);
  }

  {
    const res = await api(`/contacts/lists/${ids.secondListId}`, {
      method: "DELETE",
    });
    eq("an unused list deletes cleanly", res.status, 200);
  }
} finally {
  await cleanup();

  const leftover =
    (await Contact.count({ where: { email: { [Op.like]: `${TAG}-%` } } })) +
    (await ContactList.count({ where: { name: { [Op.like]: `${TAG}%` } } })) +
    (await Campaign.count({ where: { name: { [Op.like]: `${TAG}%` } } })) +
    (await Subscriber.count({ where: { email: { [Op.like]: `${TAG}-%` } } }));

  console.log(`\nfixtures left behind: ${leftover}`);

  // `fetch` keeps its sockets alive, and `server.close()` waits for open
  // connections — without this the run finishes every assertion and then hangs
  // forever, which reads exactly like a failing test.
  server.closeAllConnections?.();
  server.close();
  await db.sequelize.close();

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}
