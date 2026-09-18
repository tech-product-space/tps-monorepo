import db from "../../database/postgres/models/index.js";
const { FreeCourse, FreeCourseCertificate } = db;

import { FREE_COURSE_CERTIFICATE_STATUS } from "../../config/constants/freeCourseCertificate.js";

/**
 * Course certificates issued to this person, newest first.
 *
 * Matched on `userId` alone — unlike events, which have to match on email too
 * because a teammate is issued a certificate before they have an account. There
 * is no account-less path into a free course, so there are no orphan rows to
 * find by address.
 *
 * **No presigned URLs.** This is a list; the download endpoint mints access when
 * someone actually opens one. A URL in a listing outlives a revocation.
 */
export const resolveMyCourseCertificates = async (userId) => {
  if (!userId) return [];

  return FreeCourseCertificate.findAll({
    where: {
      userId,
      status: FREE_COURSE_CERTIFICATE_STATUS.ISSUED,
    },
    attributes: ["certificateNo", "recipientName", "issuedAt"],
    include: [
      {
        model: FreeCourse,
        as: "course",
        attributes: ["title", "subTitle", "slug", "thumbnail"],
      },
    ],
    order: [["issuedAt", "DESC"]],
  });
};

/**
 * Which of these courses this person already holds a live certificate for.
 *
 * One query for the whole shelf. Used by the dashboard course list, where a
 * held certificate — not the percentage — decides whether a course reads as
 * finished: an admin publishing a lesson afterwards drops the bar below 100%,
 * and a card that then says "Resume" to somebody holding that course's
 * certificate is telling them, on the same screen, both that they finished and
 * that they did not.
 *
 * Revoked rows are excluded, so a withdrawn certificate correctly returns the
 * course to its real progress state.
 */
export const courseIdsWithCertificate = async (userId, courseIds = []) => {
  if (!userId || !courseIds.length) return new Set();

  const rows = await FreeCourseCertificate.findAll({
    where: {
      userId,
      freeCourseId: courseIds,
      status: FREE_COURSE_CERTIFICATE_STATUS.ISSUED,
    },
    attributes: ["freeCourseId"],
  });

  return new Set(rows.map((row) => row.freeCourseId));
};
