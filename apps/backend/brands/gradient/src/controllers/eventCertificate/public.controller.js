import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const { Event, EventCertificate, EventGuest, User } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { EVENT_CERTIFICATE_STATUS } from "../../config/constants/eventCertificate.js";
import { getObjectBuffer } from "../../util/s3.js";
import { resolveMyCertificates } from "../../services/dashboard/myCertificates.service.js";

/**
 * What the file is called once it lands in someone's Downloads folder.
 *
 * The event title makes it recognisable among a dozen others; the certificate
 * number keeps it unique. ASCII only, because the header is latin-1 and a title
 * with an em dash or an accent in it would otherwise mangle the whole filename.
 */
export const downloadFileName = (certificate) => {
  const title = String(certificate.event?.eventTitle || "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return [title, certificate.certificateNo].filter(Boolean).join("-") + ".pdf";
};

/**
 * Fetch an event certificate the signed-in user owns, or null.
 *
 * Matching on `guestId` **or** email is the rule the listing uses too — a
 * teammate's certificate carries no `guestId` until they register. Extracted so
 * the unified dashboard download route decides ownership the same way this one
 * does; two copies of that rule is how the two screens start disagreeing about
 * what somebody owns.
 */
export const findOwnedEventCertificate = async ({ userId, certificateNo }) => {
  const user = await User.findByPk(userId, { attributes: ["id", "email"] });

  if (!user) return null;

  const email = String(user.email || "").trim().toLowerCase();

  const guestIds = (
    await EventGuest.findAll({ where: { userId }, attributes: ["id"] })
  ).map((guest) => guest.id);

  if (!email && !guestIds.length) return null;

  return EventCertificate.findOne({
    where: {
      certificateNo,
      status: EVENT_CERTIFICATE_STATUS.ISSUED,
      [Op.or]: [
        ...(email ? [{ recipientEmail: email }] : []),
        ...(guestIds.length ? [{ guestId: { [Op.in]: guestIds } }] : []),
      ],
    },
    include: [{ model: Event, as: "event", attributes: ["eventTitle"] }],
  });
};

/**
 * GET /events/certificates/public/mine
 *
 * A person's own certificates. There is no public certificate page and no
 * public lookup by number — a certificate is reachable only by the person it
 * belongs to, signed in.
 */
export const getMyCertificates = asyncWrapper(async (req, res) => {
  const userId = req.user?.id;

  const user = await User.findByPk(userId, { attributes: ["id", "email"] });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // The matching rule lives in the service because the dashboard summary asks
  // the same question, and a second copy of "guestId or email" is how the two
  // screens start disagreeing about what someone owns.
  const certificates = await resolveMyCertificates({
    userId,
    email: user.email,
  });

  return res.status(200).json({ data: certificates });
});

/**
 * GET /events/certificates/public/mine/:certificateNo/download
 *
 * Sends the PDF itself — bytes, not a link.
 *
 * The file is fetched from private storage server-side and streamed back under
 * `Content-Disposition: attachment`, so the browser saves it straight to disk.
 * The storage URL never reaches the client: nothing to copy out of the network
 * tab, nothing to paste to somebody else, and no expiry to race.
 *
 * Ownership is re-checked here rather than trusted from the listing: the
 * certificate number is the only thing the browser sends, and it is short and
 * guessable by design so people can read one off a printed page. Matching on
 * `guestId` **or** email is the same rule the listing uses — a teammate's
 * certificate carries no `guestId` until they register.
 *
 * A `Revoked` certificate stops resolving here, which is what makes revocation
 * mean something: this is the only route to the file.
 */
export const downloadMyCertificate = asyncWrapper(async (req, res) => {
  const { certificateNo } = req.params;

  const certificate = await findOwnedEventCertificate({
    userId: req.user?.id,
    certificateNo,
  });

  // 404 rather than 403 for one that exists but is not theirs — telling a
  // stranger "that number is real, just not yours" is the enumeration answer.
  if (!certificate || !certificate.fileKey) {
    return res.status(404).json({ message: "Certificate not found" });
  }

  const pdf = await getObjectBuffer(certificate.fileKey, { isPrivate: true });

  // Certificates are single-page PDFs — tens of kilobytes — so buffering is
  // cheaper than the bookkeeping a streamed body needs to abort cleanly.
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", pdf.length);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${downloadFileName(certificate)}"`,
  );
  // A certificate is per-person and revocable; a cached copy in a shared proxy
  // is the one place revocation could not reach.
  res.setHeader("Cache-Control", "private, no-store");

  return res.status(200).send(pdf);
});
