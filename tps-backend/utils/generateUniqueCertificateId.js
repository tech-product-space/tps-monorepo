"use strict";

const { ulid } = require("ulid");
const { UserCourseCertificate } = require("../models");

/**
 * Generates a unique certificate_id
 * - short
 * - human friendly
 * - DB-safe
 */
async function generateUniqueCertificateId(maxAttempts = 5) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    const certificateId = `PSCERT-C-${ulid().slice(-6)}`;

    const exists = await UserCourseCertificate.findOne({
      where: { certificate_id: certificateId },
      attributes: ["id"],
    });

    if (!exists) {
      return certificateId;
    }
  }

  throw new Error("Unable to generate unique certificate ID");
}

module.exports = { generateUniqueCertificateId };