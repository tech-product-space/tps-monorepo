import db from "../../database/postgres/models/index.js";
import {
  CAMPAIGN_EDITABLE_FIELDS,
  CAMPAIGN_STATUS,
  EMPTY_RECIPIENT_FILTERS,
} from "../../config/constants/campaign.js";
import { EMAIL_PROVIDER_ID } from "../../services/email/index.js";
import { isSupportedSourceType } from "../../services/campaign/recipientResolver/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";

const { Campaign, AdminUser } = db;

/**
 * Statuses in which a campaign is no longer the admin's to change.
 *
 * Editing mid-send means half the audience gets a different email from the
 * other half; editing after the fact rewrites the record of what was sent to
 * several thousand people. Both are worse than making someone duplicate the
 * campaign. Mirrors the guard in `eventReminder.controller.js`.
 */
const LOCKED_STATUSES = [CAMPAIGN_STATUS.PROCESSING, CAMPAIGN_STATUS.SENT];

const isLocked = (campaign) => LOCKED_STATUSES.includes(campaign.status);

/**
 * Validates the audience shape before it is stored.
 *
 * `recipientFilters` is JSONB, so nothing at the database layer will object to
 * a typo'd source type — it would surface as a resolver error at send time,
 * which is the worst possible moment to find out.
 */
const validateRecipientFilters = (filters) => {
  if (filters === undefined) return null;

  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return "recipientFilters must be an object";
  }

  for (const side of ["include", "exclude"]) {
    const clauses = filters[side];

    if (clauses === undefined) continue;

    if (!Array.isArray(clauses)) {
      return `recipientFilters.${side} must be an array`;
    }

    for (const clause of clauses) {
      if (!clause || typeof clause !== "object") {
        return `Each ${side} entry must be an object with a 'type'`;
      }

      if (!isSupportedSourceType(clause.type)) {
        return `Unsupported audience source "${clause.type}" in ${side}`;
      }

      if (
        clause.filters !== undefined &&
        (typeof clause.filters !== "object" || Array.isArray(clause.filters))
      ) {
        return `Filters for "${clause.type}" must be an object`;
      }
    }
  }

  return null;
};

/**
 * CREATE CAMPAIGN
 *
 * Name only. Everything else is filled in through the editor, which is why the
 * other columns are nullable and why `validateCampaign` on the send path — not
 * this endpoint — is what decides a campaign is ready.
 */
export const createCampaign = asyncWrapper(async (req, res) => {
  const { name } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: "name is required" });
  }

  const campaign = await Campaign.create({
    name: String(name).trim(),
    recipientFilters: EMPTY_RECIPIENT_FILTERS,
    createdBy: req.admin?.id || null,
  });

  return res.status(201).json({
    message: "Campaign created",
    data: campaign,
  });
});

/**
 * LIST CAMPAIGNS
 */
export const listCampaigns = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { status } = req.query;

  const where = {};
  if (status) where.status = status;

  const { rows, count } = await Campaign.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    // The list does not need the HTML body, and a page of 20 campaigns would
    // otherwise ship 20 emails' worth of markup to render a table.
    attributes: { exclude: ["body"] },
    include: [
      {
        model: AdminUser,
        as: "createdAdmin",
        attributes: ["id", "name", "email"],
      },
    ],
  });

  return res.json({
    data: rows,
    meta: getMeta(count, page, limit),
  });
});

/**
 * GET ONE CAMPAIGN
 */
export const getCampaign = asyncWrapper(async (req, res) => {
  const campaign = await Campaign.findByPk(req.params.id, {
    include: [
      {
        model: AdminUser,
        as: "createdAdmin",
        attributes: ["id", "name", "email"],
      },
    ],
  });

  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  return res.json({ data: campaign });
});

/**
 * UPDATE CAMPAIGN
 */
export const updateCampaign = asyncWrapper(async (req, res) => {
  const campaign = await Campaign.findByPk(req.params.id);

  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  if (isLocked(campaign)) {
    return res.status(400).json({
      message:
        campaign.status === CAMPAIGN_STATUS.PROCESSING
          ? "Cannot edit a campaign while it is sending"
          : "Cannot edit a campaign that has already been sent",
    });
  }

  const filterError = validateRecipientFilters(req.body.recipientFilters);

  if (filterError) {
    return res.status(400).json({ message: filterError });
  }

  if (
    req.body.senderEmail !== undefined &&
    !Object.values(EMAIL_PROVIDER_ID).includes(req.body.senderEmail)
  ) {
    // A `from` address SES has not verified fails at send time with an error
    // that says nothing about which field caused it.
    return res.status(400).json({ message: "Invalid 'senderEmail'" });
  }

  // Whitelist, not `req.body`. Status, counters and timestamps belong to the
  // send job — a stray field must not be able to mark a campaign as sent.
  const updates = { updatedBy: req.admin?.id || null };

  for (const field of CAMPAIGN_EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  await campaign.update(updates);

  return res.json({
    message: "Campaign updated",
    data: campaign,
  });
});

/**
 * DUPLICATE CAMPAIGN
 *
 * The way to "edit" a sent campaign: sent and sending ones are locked, so
 * copying is what people actually want when they reach for edit on last
 * month's newsletter.
 *
 * Copies the content and the audience **query** — not the resolved recipients.
 * The copy resolves fresh when it sends, so a duplicate of a campaign from
 * March reaches everybody who qualifies today, not March's list.
 *
 * Nothing about the original's send is carried over: status, timestamps,
 * counters and `campaign_recipients` all belong to that send and would be a
 * lie on a draft.
 */
export const duplicateCampaign = asyncWrapper(async (req, res) => {
  const original = await Campaign.findByPk(req.params.id);

  if (!original) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  const name =
    req.body?.name?.trim() || `${original.name} (copy)`.slice(0, 255);

  const copy = await Campaign.create({
    name,
    subject: original.subject,
    body: original.body,
    senderEmail: original.senderEmail,
    senderName: original.senderName,
    recipientFilters: original.recipientFilters ?? EMPTY_RECIPIENT_FILTERS,
    status: CAMPAIGN_STATUS.DRAFT,
    createdBy: req.admin?.id || null,
  });

  req.activity?.set({
    entityLabel: copy.name,
    metadata: { copiedFrom: original.id, copiedFromName: original.name },
  });

  return res.status(201).json({
    message: "Campaign duplicated",
    data: copy,
  });
});

/**
 * DELETE CAMPAIGN
 *
 * A sent campaign stays deletable: it is the admin's record to keep or discard,
 * and the recipient rows cascade with it. One being *sent right now* does not,
 * because the job would carry on writing rows against a campaign that no longer
 * exists.
 */
export const deleteCampaign = asyncWrapper(async (req, res) => {
  const campaign = await Campaign.findByPk(req.params.id);

  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  if (campaign.status === CAMPAIGN_STATUS.PROCESSING) {
    return res.status(400).json({
      message: "Cannot delete a campaign while it is sending",
    });
  }

  // The automatic label lookup cannot run once the row is gone.
  req.activity?.set({ entityLabel: campaign.name });

  await campaign.destroy();

  return res.json({ message: "Campaign deleted" });
});
