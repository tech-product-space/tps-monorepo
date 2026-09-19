/**
 * Throwaway probe for the recordings feature. Creates real rows, asserts, then
 * deletes everything it made. Run: node sandbox/recordings-probe.js
 */
require("dotenv").config();

const db = require("../models");
const { Recording, RecordingCategory, RecordingLead } = db;

let pass = 0;
const failures = [];

const ok = (label, condition) => {
  if (condition) {
    pass += 1;
  } else {
    failures.push(label);
    console.log("  FAIL:", label);
  }
};

// Minimal express-less controller driving: call the handler with a fake req/res.
// `asyncWrapper` returns undefined rather than the promise, so the only way to
// know the handler finished is to wait for the response it writes — or for the
// error it hands to `next`.
const call = (handler, req = {}) =>
  new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(body) {
        resolve({ status, body });
        return this;
      },
    };
    handler({ query: {}, body: {}, params: {}, ...req }, res, (err) =>
      reject(err instanceof Error ? err : new Error(String(err)))
    );
  });

const crud = require("../controllers/recording/crudController");
const publicCtl = require("../controllers/recording/publicController");
const leadCtl = require("../controllers/recording/leadController");
const categoryCtl = require("../controllers/recording/categoryController");

const VIDEO_ID = "dQw4w9WgXcQ";
const made = { recordings: [], categories: [] };

(async () => {
  // ── the seeder ────────────────────────────────────────────────────────────
  const seeded = await RecordingCategory.findAll({ order: [["order", "ASC"]] });
  ok("seeder created chips", seeded.length >= 7);
  ok(
    "chips are ordered and slugged",
    seeded[0].slug === "product-management" && seeded[0].order === 0
  );

  const category = seeded[0];
  const otherCategory = seeded[1];

  // ── create ────────────────────────────────────────────────────────────────
  let r = await call(crud.createRecording, {
    body: { title: "Probe Recording One" },
  });
  ok("create without category is a 400", r.status === 400);

  r = await call(crud.createRecording, {
    body: { title: "Probe Recording One", categoryId: "does-not-exist" },
  });
  ok("create with an unknown category is a 400", r.status === 400);

  r = await call(crud.createRecording, {
    body: {
      title: "Probe Recording One",
      categoryId: category.id,
      video: { url: "https://vimeo.com/12345" },
    },
  });
  ok("a Vimeo URL is a 400, not a silent null", r.status === 400);
  ok(
    "…with a readable message",
    /YouTube/.test(r.body?.message ?? "")
  );

  r = await call(crud.createRecording, {
    body: {
      title: "Probe Recording One",
      categoryId: category.id,
      subtitle: "The first probe row",
      format: "Workshop",
      durationMinutes: 98,
      attendeeCount: 2987,
      content: {
        whatYouWillLearn: "<ul><li><strong>One</strong><br>Two</li></ul>",
        somethingInvented: "<p>should be dropped</p>",
      },
      speakers: [{ name: "Probe Speaker", title: "PM", company: "Acme" }],
      host: { name: "Probe Host" },
      seo: { title: "Probe" },
    },
  });
  ok("create returns 201", r.status === 201);
  const one = r.body.data;
  made.recordings.push(one.id);
  ok("slug derives from title", one.slug === "probe-recording-one");
  ok("settings default to {} on the row", JSON.stringify(one.settings) === "{}");
  ok(
    "an unknown content key is dropped on write",
    Object.keys(one.content).length === 1 && one.content.whatYouWillLearn
  );

  // Invalid format is refused by the model validator; Masterclass is not
  // invalid — it is the standalone format, added after the first build.
  let rejected = false;
  try {
    await Recording.create({
      title: "Bad format",
      slug: "probe-bad-format",
      format: "Fireside",
    });
  } catch (err) {
    rejected = true;
  }
  ok("a format outside the vocabulary is rejected", rejected);

  const masterclass = await Recording.create({
    title: "Probe Masterclass",
    slug: "probe-masterclass",
    categoryId: category.id,
    format: "Masterclass",
  });
  made.recordings.push(masterclass.id);
  ok("Masterclass is accepted", masterclass.format === "Masterclass");

  // The create endpoint takes it too — the add form sends it now.
  r = await call(crud.createRecording, {
    body: {
      title: "Probe Created With Format",
      categoryId: category.id,
      format: "Masterclass",
    },
  });
  made.recordings.push(r.body.data.id);
  ok("create accepts a format", r.body.data.format === "Masterclass");

  // ── settings resolver ─────────────────────────────────────────────────────
  const { resolveRecordingSettings } = require("../constants/recording");
  const resolved = resolveRecordingSettings(one);
  ok(
    "the resolver layers defaults under an empty settings column",
    resolved.gateVideo === true && resolved.showKeepExploring === true
  );

  // ── publish gate ──────────────────────────────────────────────────────────
  r = await call(crud.toggleRecordingStatus, { params: { id: one.id } });
  ok("publishing without a video is refused", r.status === 400);
  ok(
    "…and says why",
    /Add a YouTube link/.test(r.body?.message ?? "")
  );

  r = await call(crud.updateRecording, {
    params: { id: one.id },
    body: {
      video: { url: `https://www.youtube.com/watch?v=${VIDEO_ID}&t=42` },
      // Sending only one content key must preserve the other.
      content: { whyThisMatters: "<p>Because.</p>" },
    },
  });
  ok("update parses the video id server-side", r.body.data.video.videoId === VIDEO_ID);
  ok(
    "an omitted content key is preserved (merge, not replace)",
    r.body.data.content.whatYouWillLearn && r.body.data.content.whyThisMatters
  );

  r = await call(crud.toggleRecordingStatus, { params: { id: one.id } });
  ok("publishing with a video succeeds", r.status === 200 && r.body.data.isPublished);
  const firstPublishedAt = r.body.data.publishedAt;
  ok("publishedAt is stamped on publish", Boolean(firstPublishedAt));

  await call(crud.toggleRecordingStatus, { params: { id: one.id } });
  r = await call(crud.toggleRecordingStatus, { params: { id: one.id } });
  ok(
    "publishedAt is stamped once, not re-stamped on re-publish",
    new Date(r.body.data.publishedAt).getTime() ===
      new Date(firstPublishedAt).getTime()
  );

  // A second, sibling recording for "keep exploring" auto-fill.
  r = await call(crud.createRecording, {
    body: { title: "Probe Recording Two", categoryId: category.id },
  });
  const two = r.body.data;
  made.recordings.push(two.id);
  await call(crud.updateRecording, {
    params: { id: two.id },
    body: { video: { url: `https://youtu.be/${VIDEO_ID}` } },
  });
  await call(crud.toggleRecordingStatus, { params: { id: two.id } });

  // ── the public payload ────────────────────────────────────────────────────
  r = await call(publicCtl.getPublicRecordingBySlug, {
    params: { slug: one.slug },
  });
  ok("public detail returns the recording", r.status === 200);
  const raw = JSON.stringify(r.body);
  ok("the gated payload contains no video id anywhere", !raw.includes(VIDEO_ID));
  ok("…and says it is gated", r.body.data.isGated === true);
  ok(
    "…carrying only the provider",
    Object.keys(r.body.data.video).join(",") === "provider"
  );
  ok(
    "keep exploring auto-fills from the same category",
    r.body.data.relatedRecordings.some((c) => c.id === two.id)
  );
  ok("attendee count is shown by default", r.body.data.attendeeCount === 2987);

  // Ungate it and the whole block ships.
  await call(crud.updateRecording, {
    params: { id: one.id },
    body: { settings: { gateVideo: false } },
  });
  r = await call(publicCtl.getPublicRecordingBySlug, {
    params: { slug: one.slug },
  });
  ok(
    "ungated, the video block ships whole",
    r.body.data.isGated === false && r.body.data.video.videoId === VIDEO_ID
  );
  await call(crud.updateRecording, {
    params: { id: one.id },
    body: { settings: { gateVideo: true } },
  });

  // A draft is invisible to the public.
  r = await call(crud.createRecording, {
    body: { title: "Probe Draft", categoryId: category.id },
  });
  made.recordings.push(r.body.data.id);
  r = await call(publicCtl.getPublicRecordingBySlug, {
    params: { slug: "probe-draft" },
  });
  ok("an unpublished recording 404s publicly", r.status === 404);

  // ── the listing ───────────────────────────────────────────────────────────
  r = await call(publicCtl.listPublicRecordings, {
    query: { category: category.slug },
  });
  ok(
    "the chip filter returns the published rows",
    r.body.data.length >= 2 && r.body.data.every((c) => !("speakers" in c))
  );
  ok(
    "the card carries speakers[0] flattened",
    r.body.data.find((c) => c.id === one.id)?.speaker?.name === "Probe Speaker"
  );

  r = await call(publicCtl.listPublicRecordings, {
    query: { category: "no-such-chip" },
  });
  ok(
    "an unknown category slug is an empty list, not a 404",
    r.status === 200 && r.body.data.length === 0
  );

  r = await call(publicCtl.listPublicRecordings, { query: { q: "Probe Record" } });
  ok("search matches title", r.body.data.length >= 2);

  // ── the gate ──────────────────────────────────────────────────────────────
  r = await call(leadCtl.createRecordingLead, {
    body: {
      recordingId: one.id,
      email: "  Probe.Person@Example.COM ",
      name: "Probe Person",
      role: "Product Manager",
      attendeeType: "Student",
      collegeName: "Probe College",
      graduationYear: "2027",
      phone: "9999999999",
    },
  });
  ok("first gate pass is a 201", r.status === 201);
  ok("…and hands back the video", r.body.data.video.videoId === VIDEO_ID);

  let lead = await RecordingLead.findOne({
    where: { recordingId: one.id },
  });
  ok("email is stored lowercased and trimmed", lead.email === "probe.person@example.com");
  ok("role maps into jobTitle", lead.jobTitle === "Product Manager");
  ok("the student branch is stored", lead.collegeName === "Probe College");

  r = await call(leadCtl.createRecordingLead, {
    body: {
      recordingId: one.id,
      email: "probe.person@example.com",
      // A hurried re-entry with the optional fields blank.
      attendeeType: "Student",
    },
  });
  ok("a repeat pass is a 200, not a 409", r.status === 200);

  await lead.reload();
  ok("…bumping submissionCount", lead.submissionCount === 2);
  ok("…without erasing what the fuller pass gave us", lead.name === "Probe Person");

  const leadRows = await RecordingLead.count({ where: { recordingId: one.id } });
  ok("…and without inserting a second row", leadRows === 1);

  const reloadedOne = await Recording.findByPk(one.id);
  ok("viewCount counts both passes", reloadedOne.viewCount === 2);

  r = await call(leadCtl.createRecordingLead, {
    body: { recordingId: one.id, email: "x@example.com", attendeeType: "Alien" },
  });
  ok("an invented attendeeType is a 400", r.status === 400);

  r = await call(leadCtl.createRecordingLead, {
    body: { recordingId: one.id },
  });
  ok("the gate needs an email", r.status === 400);

  // The unique index, not just the lookup.
  let clashed = false;
  try {
    await RecordingLead.create({
      recordingId: one.id,
      email: "PROBE.PERSON@example.com",
    });
  } catch (err) {
    clashed = true;
  }
  ok("the unique index refuses a second row for the same person", clashed);

  // ── the admin list ────────────────────────────────────────────────────────
  r = await call(crud.listRecordings, { query: { q: "Probe" } });
  const listedOne = r.body.data.find((row) => row.id === one.id);
  ok("the admin list splits people from passes",
    listedOne.leadCount === 1 && listedOne.newViews === 1 && listedOne.repeatViews === 1);
  ok(
    "drafts sort first, not last",
    r.body.data[0].isPublished === false
  );

  r = await call(crud.listRecordings, { query: { sort: "constructor" } });
  ok("an invented sort falls back rather than 500ing", r.status === 200);

  r = await call(crud.listRecordings, { query: { q: "Probe", isPublished: "false" } });
  ok("the status filter works", r.body.data.every((row) => !row.isPublished));

  r = await call(crud.checkSlugAvailability, { query: { slug: one.slug } });
  ok("a taken slug reads as unavailable", r.body.data.available === false);
  r = await call(crud.checkSlugAvailability, {
    query: { slug: one.slug, excludeId: one.id },
  });
  ok("…except to the recording that holds it", r.body.data.available === true);

  // ── categories ────────────────────────────────────────────────────────────
  r = await call(categoryCtl.listCategories);
  const withCount = r.body.data.find((c) => c.id === category.id);
  ok("category list carries recordingCount", withCount.recordingCount >= 2);

  r = await call(categoryCtl.createCategory, { body: { name: "Probe Chip" } });
  const chip = r.body.data;
  made.categories.push(chip.id);
  ok("a new chip is appended, not inserted", chip.order > seeded.length - 1);
  ok("its slug derives from the name", chip.slug === "probe-chip");

  await call(crud.updateRecording, {
    params: { id: made.recordings[2] },
    body: { categoryId: chip.id },
  });
  r = await call(categoryCtl.deleteCategory, { params: { id: chip.id } });
  ok("delete reports how many are uncategorised", r.body.data.uncategorisedRecordings === 1);
  made.categories = made.categories.filter((id) => id !== chip.id);

  const orphan = await Recording.findByPk(made.recordings[2]);
  ok("…and the recordings survive it", orphan && orphan.categoryId === null);

  // ── workflow + campaign wiring ────────────────────────────────────────────
  const { matchRecordingLead } = require("../service/workflow/triggers/matchers");
  ok(
    "the trigger matcher filters by recording",
    matchRecordingLead({ recordingId: one.id }, { recordingFilters: { [one.id]: {} } }) &&
      !matchRecordingLead({ recordingId: two.id }, { recordingFilters: { [one.id]: {} } })
  );

  const { loadLead } = require("../service/workflow/triggers/leadLoader");
  const loaded = await loadLead("recordings", lead.id);
  ok(
    "the trigger loader normalises a recording lead",
    loaded?.email === "probe.person@example.com" && loaded.source_type === "recordings"
  );

  const {
    resolveRecordingLeads,
  } = require("../service/campaign/resolver/recordingLeadResolver");
  const byRecording = await resolveRecordingLeads({
    recordingFilters: { [one.id]: {} },
  });
  ok(
    "the campaign resolver returns the recipient",
    byRecording.length === 1 && byRecording[0].source_type === "recordings"
  );

  const byCategory = await resolveRecordingLeads({ categoryIds: [category.id] });
  ok("…and filters by category", byCategory.length === 1);

  const byWrongCategory = await resolveRecordingLeads({
    categoryIds: [otherCategory.id],
  });
  ok("…excluding other categories", byWrongCategory.length === 0);

  const empty = await resolveRecordingLeads({});
  ok("an unfinished audience resolves to nobody", empty.length === 0);

  // ── delete cascades ───────────────────────────────────────────────────────
  r = await call(crud.deleteRecording, { params: { id: one.id } });
  ok("delete returns 200", r.status === 200);
  const orphanLeads = await RecordingLead.count({ where: { recordingId: one.id } });
  ok("…and takes its leads with it", orphanLeads === 0);
  made.recordings = made.recordings.filter((id) => id !== one.id);
})()
  .catch((err) => {
    console.error("PROBE ERROR:", err);
    failures.push("probe threw: " + err.message);
  })
  .finally(async () => {
    // Clean up whatever survived.
    if (made.recordings.length) {
      await RecordingLead.destroy({ where: { recordingId: made.recordings } });
      await Recording.destroy({ where: { id: made.recordings } });
    }
    await Recording.destroy({ where: { slug: "probe-bad-format" } });
    if (made.categories.length) {
      await RecordingCategory.destroy({ where: { id: made.categories } });
    }

    // The table totals, not what this probe left — it deletes everything it
    // made, so these are rows that were already there (real recordings an admin
    // created). Printed this way so a leak shows up as a number that grows.
    const totalRecordings = await Recording.count();
    const totalLeads = await RecordingLead.count();
    console.log(
      `\n${pass}/${pass + failures.length} assertions passed. ` +
        `Table holds ${totalRecordings} recordings and ${totalLeads} leads ` +
        `— none of them this probe's.`
    );
    if (failures.length) console.log("Failures:\n - " + failures.join("\n - "));
    process.exit(failures.length ? 1 : 0);
  });
