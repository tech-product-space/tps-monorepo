import { Op } from "sequelize";
import {
  SUBSCRIBER_STATUS,
  SUBSCRIBER_SOURCE,
  REACTIVATABLE_SOURCES,
} from "../../config/constants/subscriber.js";
import db from "../../database/postgres/models/index.js";
const { Subscriber } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createSubscriber = asyncWrapper(async (req, res) => {
  const {
    email,
    source = SUBSCRIBER_SOURCE.FOOTER,
    pageUrl,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
  } = req.body;

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({
      message: "A valid email is required",
    });
  }

  const existing = await Subscriber.findOne({
    where: { email: normalizedEmail },
  });

  if (existing) {
    // Re-activate a previously unsubscribed email; otherwise treat as success.
    //
    // Someone typing their address into this form is a fresh opt-in, so a
    // previous decision to leave is theirs to reverse — but only when it *was*
    // a decision. This table is the campaign suppression list now, and a row
    // suppressed by a bounce or a spam complaint is a dead or hostile mailbox,
    // not a preference: re-activating those would put a known-bad address back
    // into every future audience and drive the bounce rate back up. Those rows
    // stay suppressed, and the form still reports success — there is nothing
    // useful to tell the visitor, and a bounce is not their fault.
    const mayReactivate = REACTIVATABLE_SOURCES.includes(existing.source);

    if (existing.status === SUBSCRIBER_STATUS.UNSUBSCRIBED && mayReactivate) {
      // Cleared together with the status, or the row reads as both subscribed
      // and unsubscribed-with-a-reason at the same time.
      await existing.update({
        status: SUBSCRIBER_STATUS.ACTIVE,
        unsubscribedAt: null,
        unsubscribeReason: null,
        unsubscribedFromCampaignId: null,
      });
    }

    return res.status(200).json({
      message: "You are already subscribed",
    });
  }

  await Subscriber.create({
    email: normalizedEmail,
    status: SUBSCRIBER_STATUS.ACTIVE,
    source,
    pageUrl,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
  });

  return res.status(201).json({
    message: "Subscribed successfully",
  });
});

export const listSubscribers = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { status, source, search } = req.query;

  const where = {};

  if (status) where.status = status;
  if (source) where.source = source;

  if (search) {
    where[Op.or] = [
      { email: { [Op.iLike]: `%${search}%` } },
      { name: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Subscriber.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  const meta = getMeta(count, page, limit);

  res.json({
    data: rows,
    meta,
  });
});
