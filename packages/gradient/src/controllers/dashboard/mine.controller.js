import db from "../../database/postgres/models/index.js";
const { User } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { resolveMyEvents } from "../../services/dashboard/myEvents.service.js";
import { resolveMyCourses } from "../../services/dashboard/myCourses.service.js";
import { resolveMyCertificates } from "../../services/dashboard/myCertificates.service.js";
import { resolveMyCourseCertificates } from "../../services/dashboard/myCourseCertificates.service.js";
import { EVENT_GUEST_STATUS } from "../../config/constants/eventGuest.js";
import {
  findOwnedCourseCertificate,
  sendCertificatePdf,
} from "../freeCourseCertificate/public.controller.js";
import {
  downloadFileName as eventCertificateFileName,
  findOwnedEventCertificate,
} from "../eventCertificate/public.controller.js";

/**
 * The signed-in dashboard.
 *
 * One rule holds across every endpoint here, and it is the whole reason this
 * file exists separately: **identity comes from the cookie, never from a
 * parameter.** No route below reads a user id from the body, the query or the
 * path, so there is no version of these requests that returns somebody else's
 * history. The implementation this is modelled on took `{ userId }` in a POST
 * body on unauthenticated routes; changing one number returned another
 * person's certificates and a working download link for them.
 */

/** Every endpoint here needs the email too — see the services for why. */
const requireUser = async (req, res) => {
  const user = await User.findByPk(req.user?.id, {
    attributes: ["id", "email", "fullName"],
  });

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return null;
  }

  return user;
};

/**
 * GET /events/guest/mine
 */
export const getMyEvents = asyncWrapper(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const events = await resolveMyEvents({
    userId: user.id,
    email: user.email,
  });

  return res.status(200).json({ data: events });
});

/**
 * GET /free-courses/mine
 */
export const getMyCourses = asyncWrapper(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const courses = await resolveMyCourses(user.id);

  return res.status(200).json({ data: courses });
});

/** Certificate kinds the unified routes understand. */
const CERTIFICATE_KIND = Object.freeze({
  EVENT: "event",
  FREE_COURSE: "freeCourse",
});

/**
 * One shape for a certificate, whichever table it came from.
 *
 * Used by the listing *and* by the Overview summary, deliberately: those two
 * screens sit next to each other, and handing them different shapes is how the
 * card on Overview ends up saying "Gradient event" about a course certificate.
 * `kind` is also the download address — two tables mint numbers from the same
 * alphabet, so the number alone does not identify a file.
 */
const toPublicCertificate = (certificate, kind) => ({
  kind,
  certificateNo: certificate.certificateNo,
  recipientName: certificate.recipientName,
  issuedAt: certificate.issuedAt,
  title:
    kind === CERTIFICATE_KIND.EVENT
      ? certificate.event?.eventTitle || null
      : certificate.course?.title || null,
  slug:
    kind === CERTIFICATE_KIND.EVENT
      ? certificate.event?.eventSlug || null
      : certificate.course?.slug || null,
  ...(kind === CERTIFICATE_KIND.EVENT
    ? { event: certificate.event }
    : { course: certificate.course }),
});

/** Both kinds, newest first, in the one shape. */
const mergeCertificates = (eventCertificates, courseCertificates) =>
  [
    ...eventCertificates.map((c) =>
      toPublicCertificate(c, CERTIFICATE_KIND.EVENT),
    ),
    ...courseCertificates.map((c) =>
      toPublicCertificate(c, CERTIFICATE_KIND.FREE_COURSE),
    ),
  ].sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0));

/**
 * GET /user/certificates
 *
 * Every certificate this person holds, of either kind, newest first.
 *
 * One list because that is what the Certificates tab is — a learner does not
 * think in "event" vs "course", they think "my certificates". Each row carries
 * a `kind` so the tab can label it and, more importantly, so the download route
 * knows which table to look in: two tables minting numbers from the same
 * alphabet will collide eventually, and "search both and hope" is not a
 * resolution rule.
 */
export const getMyCertificates = asyncWrapper(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const [eventCertificates, courseCertificates] = await Promise.all([
    resolveMyCertificates({ userId: user.id, email: user.email }),
    resolveMyCourseCertificates(user.id),
  ]);

  // Sorted across both, not concatenated — a course certificate earned today
  // belongs above an event one from last year.
  return res.status(200).json({
    data: mergeCertificates(eventCertificates, courseCertificates),
  });
});

/**
 * GET /user/certificates/:kind/:certificateNo/download
 *
 * The PDF's bytes, for either kind. Ownership is re-checked against the cookie
 * inside each finder rather than trusted from a listing — the certificate
 * number is the only thing the browser sends.
 */
export const downloadMyCertificateUnified = asyncWrapper(async (req, res) => {
  const { kind, certificateNo } = req.params;
  const userId = req.user?.id;

  if (!Object.values(CERTIFICATE_KIND).includes(kind)) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  const certificate =
    kind === CERTIFICATE_KIND.EVENT
      ? await findOwnedEventCertificate({ userId, certificateNo })
      : await findOwnedCourseCertificate({ userId, certificateNo });

  if (!certificate || !certificate.fileKey) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  const fileName =
    kind === CERTIFICATE_KIND.EVENT
      ? eventCertificateFileName(certificate)
      : undefined;

  return sendCertificatePdf(res, certificate, fileName);
});

/**
 * GET /user/summary
 *
 * What the Overview tab shows, in one call.
 *
 * Composed from the same services the individual tabs use, so a number here can
 * never drift from the tab it summarises. That is the failure mode in the
 * reference implementation, whose overview fetched every published event and
 * filtered in the browser — arriving at a "next event" that had nothing to do
 * with the ones the user had actually joined.
 */
export const getMySummary = asyncWrapper(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const [events, courses, eventCertificates, courseCertificates] =
    await Promise.all([
      resolveMyEvents({ userId: user.id, email: user.email }),
      resolveMyCourses(user.id),
      resolveMyCertificates({ userId: user.id, email: user.email }),
      resolveMyCourseCertificates(user.id),
    ]);

  // Both kinds, newest first, through the same mapper the tab uses — the
  // Overview's count and its "latest" card have to agree with the tab they
  // summarise, down to the shape.
  const certificates = mergeCertificates(eventCertificates, courseCertificates);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // resolveMyEvents already returns upcoming-first, so the first future event
  // is the next one. Declined guests are excluded — that event is not theirs.
  const nextEvent =
    events.find(
      (item) =>
        item.status !== EVENT_GUEST_STATUS.DECLINED &&
        item.event.eventStartDate &&
        new Date(item.event.eventStartDate).getTime() >= startOfToday.getTime(),
    ) || null;

  // The only genuinely actionable state on the whole dashboard: feedback is
  // open, and neither they nor a teammate has sent it in.
  const awaitingFeedback = events.filter(
    (item) =>
      item.feedback.open &&
      !item.feedback.submitted &&
      item.status !== EVENT_GUEST_STATUS.DECLINED,
  );

  // A held certificate counts as finished even when the bar does not, so
  // "continue learning" cannot nag somebody the course already certified. See
  // `certificateEarned` in myCourses.service.js.
  const inProgress = courses.filter(
    (item) =>
      item.progress.total > 0 &&
      !item.progress.completedCourse &&
      !item.certificateEarned,
  );

  return res.status(200).json({
    data: {
      name: user.fullName || null,
      counts: {
        events: events.length,
        certificates: certificates.length,
        courses: courses.length,
        coursesInProgress: inProgress.length,
        awaitingFeedback: awaitingFeedback.length,
      },
      nextEvent,
      // Capped: this is a summary, and the Events tab is one click away for
      // anyone who has more than a few outstanding.
      awaitingFeedback: awaitingFeedback.slice(0, 3),
      latestCertificate: certificates[0] || null,
      continueCourse: inProgress[0] || null,
    },
  });
});
