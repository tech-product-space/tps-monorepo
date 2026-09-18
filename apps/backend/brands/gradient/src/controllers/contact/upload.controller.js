import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import { parseContactCsv, MAX_ROWS } from "../../services/contact/parseContactCsv.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";

const { Contact, ContactList } = db;

/** Insert size. 500 rows per statement keeps the parameter count sane. */
const INSERT_CHUNK = 500;

/**
 * UPLOAD A CSV INTO A LIST
 *
 * Answers with `{ created, skipped, invalid }` rather than success or failure,
 * because a real contact CSV is never entirely clean and the counts are the
 * point: "3,997 added, 41 already on the list, 3 had no email address" is
 * something an admin can act on. See `parseContactCsv` for why one bad row does
 * not fail the file.
 */
export const uploadContacts = asyncWrapper(async (req, res) => {
  const list = await ContactList.findByPk(req.params.id);

  if (!list) {
    return res.status(404).json({ message: "Contact list not found" });
  }

  if (!req.file?.buffer?.length) {
    return res.status(400).json({ message: "No CSV file was uploaded" });
  }

  // Throws a 400 with a message naming the file's actual columns if there is
  // no email column to be found.
  const { rows, invalid, duplicatesInFile, truncated, headers } =
    parseContactCsv(req.file.buffer);

  if (!rows.length) {
    return res.status(400).json({
      message: invalid
        ? `No valid rows. All ${invalid} row${invalid === 1 ? "" : "s"} were missing a usable email address.`
        : "That file has no rows.",
    });
  }

  // Which of these are already on the list. Doing this here rather than
  // relying only on the unique index is what makes `created` and `skipped`
  // exact instead of "some number between 0 and n".
  const existing = await Contact.findAll({
    where: {
      contactListId: list.id,
      email: { [Op.in]: rows.map((r) => r.email) },
    },
    attributes: ["email"],
    raw: true,
  });

  const alreadyThere = new Set(existing.map((c) => c.email));
  const fresh = rows.filter((r) => !alreadyThere.has(r.email));

  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    await Contact.bulkCreate(
      fresh.slice(i, i + INSERT_CHUNK).map((row) => ({
        ...row,
        contactListId: list.id,
      })),
      {
        // Backstop for two uploads racing on the same list — the read above
        // cannot see rows another request has not committed yet.
        ignoreDuplicates: true,
        validate: false,
      },
    );
  }

  const total = await Contact.count({ where: { contactListId: list.id } });

  const result = {
    created: fresh.length,
    skipped: rows.length - fresh.length + duplicatesInFile,
    invalid,
    totalInList: total,
  };

  req.activity?.set({
    entityLabel: list.name,
    metadata: { ...result, columns: headers },
  });

  return res.json({
    message: truncated
      ? `Imported the first ${MAX_ROWS.toLocaleString()} rows. Split the rest into another file.`
      : `${result.created.toLocaleString()} contact${result.created === 1 ? "" : "s"} added`,
    data: { ...result, truncated },
  });
});
