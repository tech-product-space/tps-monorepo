import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { META_BACKFILL_STATUS } from "../../config/constants/metaLead.js";
import { isStale, queueBackfill } from "../../jobs/metaBackfillJob.js";
import { resolveRouting } from "../../services/meta/metaIngestion.service.js";

const { MetaAccount, MetaForm, MetaLead, MetaSource } = db;

/**
 * Cached lead forms and their routing.
 */

/**
 * Only these may be set from the panel.
 *
 * The backfill counters, `lastSeenAt`, `leadCount` and `status` belong to the
 * jobs. Accepting `req.body` wholesale is how a stray field marks a form as
 * having imported four thousand leads it never saw.
 */
const EDITABLE_FIELDS = ["sourceId", "subSourceId", "courseId", "active"];

/** Included everywhere a form is returned, so the panel can label its selects. */
const SOURCE_INCLUDE = [
  { model: MetaSource, as: "source", attributes: ["id", "key", "displayName"] },
  { model: MetaSource, as: "subSource", attributes: ["id", "key", "displayName"] },
];

/**
 * Every form, across every account, flat.
 *
 * `listForms` is per-account because the Meta screen is organised by account —
 * you connect a page, then map its forms. A workflow trigger has no account to
 * hang off: an admin picking "start this journey when somebody fills a form"
 * is thinking about forms, not about which page they happen to live under.
 *
 * Deliberately minimal — id, name, and enough context to tell two
 * similarly-named forms apart. It is a picker, not the Meta admin screen.
 */
export const listAllForms = asyncWrapper(async (req, res) => {
  const forms = await MetaForm.findAll({
    order: [["name", "ASC"]],
    attributes: ["formId", "name", "accountId", "active", "leadCount"],
    include: [
      { model: MetaAccount, as: "account", attributes: ["id", "name"] },
    ],
  });

  return res.json({
    success: true,
    data: forms.map((form) => ({
      formId: form.formId,
      name: form.name || form.formId,
      pageName: form.account?.name ?? null,
      // Shown greyed in the picker rather than hidden: a workflow may already
      // be watching a form that has since been switched off, and silently
      // dropping it from the list would make the trigger look empty.
      active: form.active !== false,
      leadCount: form.leadCount ?? 0,
    })),
  });
});

export const listForms = asyncWrapper(async (req, res) => {
  const forms = await MetaForm.findAll({
    where: { accountId: req.params.id },
    order: [["name", "ASC"]],
    include: SOURCE_INCLUDE,
  });

  return res.json({
    success: true,
    data: forms.map((form) => ({
      ...form.toJSON(),
      // Computed rather than stored: the panel warns on these and disables
      // their Backfill button, and the rule belongs in one place.
      isUnmapped: form.isUnmapped(),
    })),
  });
});

export const updateForm = asyncWrapper(async (req, res) => {
  const form = await MetaForm.findByPk(req.params.formId);

  if (!form) {
    return res.status(404).json({ success: false, message: "Form not found" });
  }

  /**
   * Validate the pair before writing either half.
   *
   * The FK stops a made-up id, but not a *wrong* one — a sub source belonging
   * to a different source would be accepted by the database and produce leads
   * attributed to a pairing that does not exist in the catalogue.
   */
  const sourceId =
    req.body.sourceId === undefined ? form.sourceId : req.body.sourceId || null;
  const subSourceId =
    req.body.subSourceId === undefined
      ? form.subSourceId
      : req.body.subSourceId || null;

  if (subSourceId) {
    const subSource = await MetaSource.findByPk(subSourceId);

    if (!subSource || !subSource.parentId) {
      return res.status(400).json({
        success: false,
        message: "That sub source does not exist",
      });
    }

    if (!sourceId || subSource.parentId !== sourceId) {
      return res.status(400).json({
        success: false,
        message: "The sub source must belong to the selected source",
      });
    }
  }

  // Captured before the write, so we can tell a routing change from a rename
  // or an Active toggle — only the former is worth offering to re-apply.
  const routingBefore = {
    sourceId: form.sourceId,
    subSourceId: form.subSourceId,
    courseId: form.courseId,
  };

  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] === undefined) continue;

    if (field === "active") {
      form.active = Boolean(req.body.active);
      continue;
    }

    const value = req.body[field];
    form[field] = value === "" || value === null ? null : String(value).trim();
  }

  await form.save();

  const routingChanged =
    routingBefore.sourceId !== form.sourceId ||
    routingBefore.subSourceId !== form.subSourceId ||
    routingBefore.courseId !== form.courseId;

  /**
   * Optionally re-attribute the leads that already arrived.
   *
   * Off by default, and it has to stay that way. Attribution is frozen at
   * import precisely so that a remap cannot silently rewrite history — every
   * report anyone has already run off the old value would change underneath
   * them with nothing recording that it happened. So this only runs when the
   * caller asks for it explicitly, and it says how many rows it touched.
   */
  let reattributed = 0;

  if (req.body.reattributeExisting && routingChanged) {
    const account = await MetaAccount.findByPk(form.accountId);

    if (!account) {
      return res.status(409).json({
        success: false,
        message: "The Facebook account for this form no longer exists.",
      });
    }

    const routing = await resolveRouting(account, form);

    // Keyed on Facebook's form id, which is what meta_leads stores — not the
    // ULID primary key.
    const [count] = await MetaLead.update(routing, {
      where: { formId: form.formId },
    });

    reattributed = count;
  }

  await form.reload({ include: SOURCE_INCLUDE });

  req.activity?.set({
    entityLabel: form.name || form.formId,
    // The count is the part worth auditing: "changed a mapping" and "rewrote
    // the attribution of 98 existing leads" must not read the same afterwards.
    ...(reattributed > 0 ? { metadata: { reattributedCount: reattributed } } : {}),
  });

  return res.json({
    success: true,
    message: reattributed
      ? `Form mapping saved — ${reattributed} existing lead${
          reattributed === 1 ? "" : "s"
        } re-attributed`
      : "Form mapping saved",
    data: { ...form.toJSON(), isUnmapped: form.isUnmapped() },
    reattributed,
  });
});

/**
 * Kick off a history import.
 *
 * Two guards, both of which exist because of how expensive the mistake is:
 *
 * 1. **Already running** → 409. A second backfill on the same form would
 *    double the Graph traffic and fight the first over the progress columns.
 *    A run that died mid-flight is reclaimed rather than blocking forever.
 *
 * 2. **Unmapped form** → 400. Routing is frozen onto each lead at import, so
 *    backfilling four thousand leads through an unmapped form produces four
 *    thousand misattributed rows that fixing the mapping afterwards will not
 *    correct. Far better to refuse than to be helpful and wrong.
 */
export const startBackfill = asyncWrapper(async (req, res) => {
  const form = await MetaForm.findByPk(req.params.formId);

  if (!form) {
    return res.status(404).json({ success: false, message: "Form not found" });
  }

  if (form.backfillStatus === META_BACKFILL_STATUS.RUNNING && !isStale(form)) {
    return res.status(409).json({
      success: false,
      message: "A backfill is already running for this form",
    });
  }

  const account = await form.getAccount();

  if (form.isUnmapped() && !account?.defaultSourceId && !account?.defaultCourseId) {
    return res.status(400).json({
      success: false,
      message:
        "Map this form to a source or course before backfilling — routing is recorded on each lead at import and cannot be corrected afterwards.",
    });
  }

  const { since } = req.body || {};

  let sinceDate = null;

  if (since) {
    const parsed = new Date(since);

    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid 'since' date",
      });
    }

    sinceDate = parsed;
  }

  form.backfillStatus = META_BACKFILL_STATUS.RUNNING;
  form.backfillTotal = 0;
  form.backfillInserted = 0;
  form.backfillAlreadyImported = 0;
  form.backfillSkipped = 0;
  form.backfillSince = sinceDate;
  form.backfillError = null;
  form.backfillStartedAt = new Date();
  form.backfillFinishedAt = null;
  await form.save();

  await queueBackfill(form.id, sinceDate ? sinceDate.toISOString() : null);

  req.activity?.set({
    entityLabel: form.name || form.formId,
    metadata: { since: sinceDate ? sinceDate.toISOString() : "all time" },
  });

  return res.status(202).json({
    success: true,
    message: "Backfill queued — progress will appear on this form",
    data: { formId: form.formId, status: META_BACKFILL_STATUS.RUNNING },
  });
});
