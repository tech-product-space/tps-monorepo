import db from "../../database/postgres/models/index.js";
const { Event, EventEmailTemplate } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { EVENT_EMAIL_TEMPLATE_TYPE } from "../../config/constants/event.js";
import {
  BODIES,
  buildEmail,
  DEFAULT_SENDER_EMAIL,
  EMAIL_PROVIDER_ID,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../../services/email/index.js";
import capitalizeName from "../../util/helpers/capitalizeName.js";
import { generateEventIcsContent } from "../../util/ics.js";

export const upsertTemplate = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const { type, subject, body } = req.body;

  if (!type || !subject || !body) {
    return res.status(400).json({
      message: "type, subject and body are required",
    });
  }

  // validate type
  if (!type || !Object.values(EVENT_EMAIL_TEMPLATE_TYPE).includes(type)) {
    return res.status(400).json({
      message: "Invalid type",
    });
  }

  const [template, created] = await EventEmailTemplate.findOrCreate({
    where: {
      eventId,
      type,
    },
    defaults: {
      eventId,
      type,
      subject,
      body,
    },
  });

  if (!created) {
    await template.update({
      subject,
      body,
    });
  }

  return res.status(200).json({
    message: created
      ? "Template created successfully"
      : "Template updated successfully",
    data: template,
  });
});


export const getTemplate = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const { type } = req.query;

  if (!type) {
    return res.status(400).json({
      message: "type is required",
    });
  }

  if (!Object.values(EVENT_EMAIL_TEMPLATE_TYPE).includes(type)) {
    return res.status(400).json({
      message: "Invalid type",
    });
  }

  const template = await EventEmailTemplate.findOne({
    where: {
      eventId,
      type,
    },
  });

  if (!template) {
    return res.status(404).json({
      message: "Template not found",
    });
  }

  return res.status(200).json({
    message: "Template fetched successfully",
    data: template,
  });
});

// Production attaches an invite for exactly these two — see eventGuest/crud.controller.js.
const TYPES_WITH_CALENDAR_INVITE = [
  EVENT_EMAIL_TEMPLATE_TYPE.APPROVED,
  EVENT_EMAIL_TEMPLATE_TYPE.REGISTERED,
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send the template to one address so an admin sees the real thing before a
 * guest does.
 *
 * `subject` and `body` come from the request rather than the saved row on
 * purpose: the point of a test is to check what is on screen, which — right
 * after an edit or a paste — is not what is in the database yet.
 *
 * Everything else mirrors the production send paths as closely as possible. A
 * test that renders differently from the real email is worse than no test, so
 * the placeholder handling and the calendar attachment are deliberately copied
 * from those paths rather than idealised here.
 */
export const sendTestTemplateEmail = asyncWrapper(async (req, res) => {
  const { eventId } = req.params;
  const { type, subject, body, to, recipientName } = req.body;

  if (!type || !subject || !body || !to) {
    return res.status(400).json({
      message: "type, subject, body and 'to' are required",
    });
  }

  if (!Object.values(EVENT_EMAIL_TEMPLATE_TYPE).includes(type)) {
    return res.status(400).json({
      message: "Invalid type",
    });
  }

  if (!EMAIL_PATTERN.test(to)) {
    return res.status(400).json({
      message: "'to' must be a valid email address",
    });
  }

  const event = await Event.findByPk(eventId);

  if (!event) {
    return res.status(404).json({
      message: "Event not found",
    });
  }

  const isCertificate = type === EVENT_EMAIL_TEMPLATE_TYPE.CERTIFICATE;

  // `{{name}}` stands in for a real guest, so let the admin choose what it
  // renders as — testing with your own name is the point. Capitalised the same
  // way the real senders do it, so the test matches character for character.
  const sampleName = capitalizeName(
    (typeof recipientName === "string" && recipientName.trim()) ||
      "sample recipient",
  );

  // Stand-in values so every placeholder resolves to something recognisable
  // instead of rendering blank. Keep this list in step with the real senders:
  // certificateIssue.service.js resolves four, the guest paths only `name`.
  const variables = isCertificate
    ? {
        name: sampleName,
        recipientName: sampleName,
        eventTitle: event.eventTitle,
        certificateNo: "GRD-0000-SAMPLE",
      }
    : { name: sampleName };

  // Only the certificate path substitutes the subject; the guest paths pass
  // `template.subject` through untouched. Mirroring that means a `{{name}}` in
  // a registration subject shows up literally here — which is exactly what the
  // recipient would get, and the reason to run a test at all.
  const renderedSubject = isCertificate
    ? BODIES.CUSTOM(subject, variables)
    : subject;

  const html = buildEmail({
    body: BODIES.CUSTOM(body, variables),
    header: HEADERS.GRADIENT,
    footer: FOOTERS.GRADIENT,
  });

  const attachments = [];

  if (TYPES_WITH_CALENDAR_INVITE.includes(type)) {
    const icsContent = generateEventIcsContent({
      title: event.eventTitle,
      description: event.eventSubtitle || "",
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      eventStartTime: event.eventStartTime,
      eventEndTime: event.eventEndTime,
      location: event.location || "",
      attendees: [to],
    });

    attachments.push({
      filename: "invite.ics",
      contentType: "text/calendar",
      content: Buffer.from(icsContent),
    });
  }

  // Prefixed so a test can never be mistaken for the real thing in a shared
  // inbox. It is the one deliberate difference from a production send.
  const result = await sendMail({
    // Both branches are pinned, matching their production paths: certificates
    // send from the noreply identity (see certificateIssue.service.js) and the
    // guest emails from the info identity (see eventGuest/crud.controller.js).
    // A test that used a different sender than the mail it stands in for would
    // misreport exactly the deliverability problem this pinning exists to fix.
    fromEmail: isCertificate
      ? EMAIL_PROVIDER_ID.GD_NORP_MAIL
      : DEFAULT_SENDER_EMAIL,
    to,
    subject: `[Test] ${renderedSubject}`,
    html,
    attachments,
  });

  if (!result.success) {
    // sendMail resolves rather than throws, so an outage would otherwise look
    // like a success to the panel.
    return res.status(422).json({
      message: "Test email could not be sent",
      error: result.error,
    });
  }

  return res.status(200).json({
    message: `Test email sent to ${to}`,
  });
});