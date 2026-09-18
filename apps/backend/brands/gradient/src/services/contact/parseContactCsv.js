import { parse } from "csv-parse/sync";

/**
 * Turns an uploaded CSV buffer into contact rows.
 *
 * Kept out of the controller because it is the only part of contact upload with
 * real behaviour in it, and because every rule below was chosen against a real
 * spreadsheet rather than a spec.
 *
 * The governing decision: **one bad row must not fail the file.** A contact CSV
 * is exported by hand from Excel or a webinar platform, and there is always a
 * trailing blank line, a merged cell, or somebody's `n/a` in the email column.
 * Rejecting the upload sends the admin away to fix a 4,000-row file by hand;
 * importing 3,997 of them and reporting the three is the useful behaviour.
 */

/** Past this the parse and the insert both belong in a job, not a request. */
export const MAX_ROWS = 20000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Header aliases. A CSV's email column is called `email`, `Email Address`,
 * `E-mail` or `mail` depending on where it was exported from, and requiring one
 * exact spelling means most real files import zero rows.
 */
const FIELD_ALIASES = {
  email: ["email", "emailaddress", "email address", "e-mail", "mail", "emailid"],
  name: ["name", "fullname", "full name", "firstname", "first name", "contactname"],
  phone: ["phone", "phonenumber", "phone number", "mobile", "mobilenumber", "contact"],
};

/** Lowercase, strip anything that is not a letter or digit. */
const normaliseHeader = (header) =>
  String(header || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const ALIAS_LOOKUP = Object.entries(FIELD_ALIASES).reduce(
  (acc, [field, aliases]) => {
    for (const alias of aliases) acc[normaliseHeader(alias)] = field;
    return acc;
  },
  {},
);

const clean = (value) => {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
};

/**
 * @returns {{ rows: {name, email, phone, additionalData}[], invalid: number,
 *            duplicatesInFile: number, truncated: boolean, headers: string[] }}
 */
export const parseContactCsv = (buffer) => {
  let records;

  try {
    records = parse(buffer, {
      columns: (header) => header.map((h) => String(h || "").trim()),
      // Excel writes a BOM; without this the first header becomes "﻿name"
      // and the email column is never found in a file that looks perfect.
      bom: true,
      skip_empty_lines: true,
      // A short row is a trailing comma, not a corrupt file.
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    });
  } catch (err) {
    const error = new Error(`That file could not be read as CSV: ${err.message}`);
    error.statusCode = 400;
    throw error;
  }

  const headers = records.length ? Object.keys(records[0]) : [];

  // Map each header to a known field once, rather than per row.
  const fieldForHeader = {};
  for (const header of headers) {
    const field = ALIAS_LOOKUP[normaliseHeader(header)];
    // First column wins: a file with both "name" and "full name" should not
    // have the second silently overwrite the first.
    if (field && !Object.values(fieldForHeader).includes(field)) {
      fieldForHeader[header] = field;
    }
  }

  if (!Object.values(fieldForHeader).includes("email")) {
    const error = new Error(
      headers.length
        ? `No email column found. Columns in this file: ${headers.join(", ")}. Name one of them "email".`
        : "That file has no rows.",
    );
    error.statusCode = 400;
    throw error;
  }

  const rows = [];
  const seen = new Set();
  let invalid = 0;
  let duplicatesInFile = 0;
  let truncated = false;

  for (const record of records) {
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      break;
    }

    const mapped = { name: null, email: null, phone: null };
    const additionalData = {};

    for (const [header, value] of Object.entries(record)) {
      const field = fieldForHeader[header];

      if (field) mapped[field] = clean(value);
      else if (clean(value) !== null) additionalData[header] = clean(value);
    }

    const email = mapped.email?.toLowerCase() ?? null;

    if (!email || !EMAIL_RE.test(email)) {
      invalid += 1;
      continue;
    }

    // Within the file. Across the file and the existing list is the unique
    // index's job — this only stops bulkCreate choking on its own payload.
    if (seen.has(email)) {
      duplicatesInFile += 1;
      continue;
    }

    seen.add(email);

    rows.push({
      name: mapped.name,
      email,
      phone: mapped.phone,
      additionalData,
    });
  }

  return { rows, invalid, duplicatesInFile, truncated, headers };
};
