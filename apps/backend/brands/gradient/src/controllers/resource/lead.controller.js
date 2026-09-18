import db from "../../database/postgres/models/index.js";
const { Resource, ResourceLead } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import {
  BODIES,
  buildEmail,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../../services/email/index.js";
import capitalizeName from "../../util/helpers/capitalizeName.js";

export const createResourceLead = asyncWrapper(async (req, res) => {
  const { resourceId } = req.query;
  const { name, email,countryCode, phone, jobTitle, additionalData } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      message: "Name and email are required",
    });
  }

  // check resource exists
  const resource = await Resource.findByPk(resourceId);

  if (!resource) {
    return res.status(404).json({
      message: "Resource not found",
    });
  }

  const lead = await ResourceLead.create({
    resourceId,
    name,
    email,
    countryCode,
    phone,
    jobTitle,
    additionalData,
  });

  if (resource.emailTemplate?.subject && resource.emailTemplate?.body) {
    const { subject, body } = resource.emailTemplate;

    const html = buildEmail({
      body: BODIES.CUSTOM(body, {
        name: capitalizeName(name),
      }),
      header: HEADERS.GRADIENT,
      footer: FOOTERS.GRADIENT,
    });

    await sendMail({
      to: email,
      subject,
      html,
    });

  }

  return res.status(201).json({
    message: "Lead captured successfully",
    data: lead,
  });
});

export const listResourceLeads = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { resourceId, email } = req.query;

  const where = {};

  if (resourceId) where.resourceId = resourceId;
  if (email) where.email = email;

  const { rows, count } = await ResourceLead.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  const meta = getMeta(count, page, limit);

  return res.status(200).json({
    data: rows,
    meta,
  });
});
