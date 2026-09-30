import db from "../../database/postgres/models/index.js";
const { Event, EventGuest, EventFeedback, EventCertificate } = db;

import { Op } from "sequelize";

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { resolveEventSettings } from "../../util/helpers/eventSettings.js";
import {
  getFeedbackForm,
  getTeammateField,
} from "../../config/constants/eventFeedbackForms.js";
import { TEAM_EVENT_TYPES } from "../../config/constants/event.js";
import { EVENT_GUEST_STATUS } from "../../config/constants/eventGuest.js";
import { validateFeedbackResponses } from "../../services/event/feedbackSchema.service.js";
import {
  autoIssueForFeedback,
  certificateReadiness,
} from "../../services/event/certificateAutoIssue.service.js";
import {
  stripInapplicableGuestFields,
  validateGuestDetails,
} from "../../services/event/guestValidation.js";

const normaliseEmail = (value) => String(value || "").trim().toLowerCase();

/**
 * Find who is submitting.
 *
 * The signed-in user wins, because a cookie cannot be typed wrong. Otherwise we
 * match the email against this event's guest list. There is no token in the
 * link — it is one shareable URL by design — so the email is the identity.
 */
const resolveGuest = async ({ event, userId, email }) => {
  if (userId) {
    const byUser = await EventGuest.findOne({
      where: { eventId: event.id, userId },
    });
    if (byUser) return byUser;
  }

  const clean = normaliseEmail(email);
  if (!clean) return null;

  return EventGuest.findOne({
    where: {
      eventId: event.id,
      // Guests were created before emails were normalised anywhere, so match
      // case-insensitively rather than trusting what is stored.
      email: { [Op.iLike]: clean },
    },
  });
};

/**
 * Has somebody already submitted on this person's behalf?
 *
 * On team events a submission describes the team's project, so letting all
 * three members submit produces three near-identical rows an admin cannot tell
 * apart. This is the job TPS's server-invented `isPrimaryMember` flag was
 * doing; the difference is that this asks the question directly instead of
 * stamping a flag on the data.
 */
const findTeamSubmission = async (event, email) => {
  if (!TEAM_EVENT_TYPES.includes(event.eventType)) return null;

  const field = getTeammateField(event.eventType);
  if (!field) return null;

  const clean = normaliseEmail(email);
  if (!clean) return null;

  // JSONB containment, parameterised. Never interpolate the address into SQL —
  // that is the injection hole in the implementation this replaces.
  const feedback = await EventFeedback.findOne({
    where: {
      eventId: event.id,
      responses: {
        [Op.contains]: { [field.key]: [{ email: clean }] },
      },
    },
    include: [
      {
        model: EventGuest,
        as: "guest",
        attributes: ["id", "name", "email"],
      },
    ],
  });

  return feedback;
};

/**
 * GET /events/feedback/public/form?slug=
 *
 * Everything the page needs before it knows who the visitor is.
 */
export const getPublicForm = asyncWrapper(async (req, res) => {
  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({ message: "slug is required" });
  }

  const event = await Event.findOne({
    where: { eventSlug: slug },
    attributes: [
      "id",
      "eventTitle",
      "eventSlug",
      "eventType",
      "canAcceptResponse",
      "settings",
    ],
  });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  const form = getFeedbackForm(event.eventType);
  const settings = resolveEventSettings(event);

  // The review step tells people their certificates cannot be unsent, so it had
  // better be true. On an event that issues by hand, the same screen would be
  // promising something that is not going to happen.
  const readiness = await certificateReadiness(event);

  return res.status(200).json({
    data: {
      event: {
        id: event.id,
        eventTitle: event.eventTitle,
        eventSlug: event.eventSlug,
        eventType: event.eventType,
      },
      form,
      isOpen: Boolean(event.canAcceptResponse && form),
      // The page needs these to decide whether to offer registration, and
      // whether to fire a CRM lead when it does — the CRM client lives in the
      // public site, not here.
      allowSelfRegistration: settings.allowSelfRegistrationOnFeedback,
      createCrmLead: settings.createCrmLeadOnFeedbackRegistration,
      // Whether submitting actually sends anything. Deliberately the combined
      // answer rather than the raw setting — "on but no template" sends nothing,
      // and the page has no business knowing which piece is missing.
      certificatesOnSubmit: readiness.autoIssueCertificate && readiness.ready,
    },
  });
});

/**
 * POST /events/feedback/public/lookup   { slug, email }
 *
 * Answers "do we know you, and is there anything left for you to do?" without
 * committing anything.
 */
export const lookupGuest = asyncWrapper(async (req, res) => {
  const { slug, email } = req.body;
  const userId = req.user?.id || null;

  if (!slug || (!email && !userId)) {
    return res.status(400).json({ message: "slug and email are required" });
  }

  const event = await Event.findOne({ where: { eventSlug: slug } });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  const guest = await resolveGuest({ event, userId, email });

  if (!guest) {
    // Not a dead end — the page opens the registration dialog from here.
    const settings = resolveEventSettings(event);

    return res.status(200).json({
      data: {
        found: false,
        canRegister: Boolean(
          settings.allowSelfRegistrationOnFeedback && event.canAcceptResponse,
        ),
      },
    });
  }

  const [ownSubmission, teamSubmission] = await Promise.all([
    EventFeedback.findOne({
      where: { eventId: event.id, guestId: guest.id },
      attributes: ["id", "submittedAt"],
    }),
    findTeamSubmission(event, guest.email),
  ]);

  let alreadySubmitted = null;

  if (ownSubmission) alreadySubmitted = "self";
  else if (teamSubmission) alreadySubmitted = "team";

  return res.status(200).json({
    data: {
      found: true,
      name: guest.name,
      email: guest.email,
      status: guest.status,
      alreadySubmitted,
      submittedBy:
        alreadySubmitted === "team"
          ? {
              name: teamSubmission.guest?.name || null,
              submittedAt: teamSubmission.submittedAt,
            }
          : null,
      // No certificate number here. There is no public page to open with one,
      // and handing it to an unauthenticated caller who typed an email address
      // gives away something they cannot use.
    },
  });
});

/**
 * POST /events/feedback/public/register
 *
 * Deliberately NOT a flag on POST /events/guest/join. An "auto-approve me"
 * parameter on the public join endpoint would let anyone skip a Workshop
 * waitlist at any time. This one only works while the feedback window is open,
 * which is after the event has happened.
 *
 * Sends no email: a "you're waitlisted" mail for an event that finished last
 * week is worse than silence.
 */
export const registerForFeedback = asyncWrapper(async (req, res) => {
  const { slug, ...details } = req.body;
  const userId = req.user?.id || null;

  if (!slug) {
    return res.status(400).json({ message: "slug is required" });
  }

  const event = await Event.findOne({ where: { eventSlug: slug } });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  if (!event.canAcceptResponse) {
    return res
      .status(403)
      .json({ message: "This event is not accepting responses right now." });
  }

  const settings = resolveEventSettings(event);

  if (!settings.allowSelfRegistrationOnFeedback) {
    return res.status(403).json({
      message: "Registration is closed for this event.",
    });
  }

  const validationError = validateGuestDetails(details);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const email = normaliseEmail(details.email);

  // Racing tabs, a double-tapped button, or a genuine earlier registration all
  // land here. None is an error — hand back the guest and let them carry on.
  const existing = await resolveGuest({ event, userId, email });

  if (existing) {
    return res.status(200).json({
      message: "Already registered for this event",
      data: { id: existing.id, name: existing.name, email: existing.email },
    });
  }

  const payload = stripInapplicableGuestFields({
    ...details,
    eventId: event.id,
    userId,
    isAccountLinked: Boolean(userId),
    email,
    status: EVENT_GUEST_STATUS.APPROVED,
    additionalData: {
      ...(details.additionalData || {}),
      // Surfaces as a chip in the admin registrations table. Post-hoc
      // approvals should be visible, not indistinguishable from real ones.
      registeredVia: "feedback",
    },
  });

  const guest = await EventGuest.create(payload);

  // A teammate can be named in a submission (certificate row created with
  // guestId: null) and register afterwards — usually by opening this very link.
  // Reattach so the certificate shows against them in admin views instead of
  // being reachable only through the email fallback. The certificate itself is
  // untouched: recipientName stays as whoever named them typed it.
  await EventCertificate.update(
    { guestId: guest.id },
    { where: { eventId: event.id, recipientEmail: email, guestId: null } },
  );

  return res.status(201).json({
    message: "Registered successfully",
    data: { id: guest.id, name: guest.name, email: guest.email },
  });
});

/**
 * POST /events/feedback/public/submit   { slug, email, responses }
 */
export const submitFeedback = asyncWrapper(async (req, res) => {
  const { slug, email, responses } = req.body;
  const userId = req.user?.id || null;

  if (!slug || !responses) {
    return res.status(400).json({ message: "slug and responses are required" });
  }

  const event = await Event.findOne({ where: { eventSlug: slug } });

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  if (!event.canAcceptResponse) {
    return res
      .status(403)
      .json({ message: "This event is not accepting responses right now." });
  }

  const guest = await resolveGuest({ event, userId, email });

  if (!guest) {
    return res.status(404).json({
      message: "We could not find a registration for this email.",
    });
  }

  if (guest.status === EVENT_GUEST_STATUS.DECLINED) {
    return res
      .status(403)
      .json({ message: "This registration was not approved for the event." });
  }

  const existing = await EventFeedback.findOne({
    where: { eventId: event.id, guestId: guest.id },
  });

  if (existing) {
    return res
      .status(409)
      .json({ message: "You have already submitted feedback for this event." });
  }

  const teamSubmission = await findTeamSubmission(event, guest.email);

  if (teamSubmission) {
    return res.status(409).json({
      message: `Your team has already submitted${
        teamSubmission.guest?.name ? ` — ${teamSubmission.guest.name} sent it in` : ""
      }.`,
      data: { alreadySubmitted: "team" },
    });
  }

  const { valid, errors, clean } = validateFeedbackResponses(
    event.eventType,
    responses,
  );

  if (!valid) {
    return res.status(422).json({ message: errors[0], errors });
  }

  const settings = resolveEventSettings(event);

  // A stranger who self-registers is approved instantly, so blocking someone
  // who actually signed up but was left on the waitlist would be perverse.
  if (
    guest.status === EVENT_GUEST_STATUS.WAITLISTED &&
    settings.promoteWaitlistedOnFeedback
  ) {
    await guest.update({
      status: EVENT_GUEST_STATUS.APPROVED,
      statusUpdatedAt: new Date(),
      additionalData: {
        ...(guest.additionalData || {}),
        approvedVia: "feedback",
      },
    });
  }

  const feedback = await EventFeedback.create({
    eventId: event.id,
    guestId: guest.id,
    responses: clean,
    submittedAt: new Date(),
  });

  // The submission is saved and will not be rolled back by anything below.
  //
  // Awaited, but only just: everything slow — render, S3, email — already runs
  // off-request inside the enqueue. What is awaited here is two queries and an
  // insert, and it buys the recipient list the success screen names back. The
  // service swallows its own failures, so this cannot 500 a saved submission.
  const certificate = await autoIssueForFeedback(feedback, event, guest);

  return res.status(201).json({
    message: "Feedback submitted",
    data: {
      id: feedback.id,
      certificate: {
        status: certificate.status,
        recipients: certificate.recipients,
      },
    },
  });
});
