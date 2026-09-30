import db from "../../database/postgres/models/index.js";
import { META_TOKEN_STATUS } from "../../config/constants/metaLead.js";
import { decrypt, encrypt, isTokenCryptoConfigured } from "../../util/tokenCrypto.js";
import logger from "../../util/logger.js";

import { graphGet, isInvalidTokenError, parseGraphError } from "./graphClient.js";
import { markSynced } from "./metaSettings.service.js";
import { alertTokenInvalid } from "./metaAlert.service.js";

const { MetaAccount, MetaForm, MetaSource } = db;

/**
 * Accounts and their cached forms.
 *
 * Shared by the controllers and by the sync job, which is what puts it in
 * `services/` rather than in a controller.
 */

/** Errors thrown here carry `status` so the controllers can stay thin. */
const httpError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

/**
 * Guard every path that has to read or write a token.
 *
 * Failing here gives the admin a message naming the variable. Without it they
 * get an opaque 500 from inside `crypto`, which is a bad hour for whoever is
 * on call.
 */
const assertCryptoReady = () => {
  if (!isTokenCryptoConfigured()) {
    throw httpError(
      "TOKEN_ENCRYPTION_KEY is not configured on the server. Facebook accounts cannot be read or saved until it is set.",
      500,
    );
  }
};

export const accountToken = (account) => {
  assertCryptoReady();
  return decrypt(account.pageTokenEnc);
};

export const getAccountOrThrow = async (id) => {
  const account = await MetaAccount.findByPk(id);

  if (!account) throw httpError("Facebook account not found", 404);

  return account;
};

/** So the panel can label its default-routing selects without a second call. */
const SOURCE_INCLUDE = [
  {
    model: MetaSource,
    as: "defaultSource",
    attributes: ["id", "key", "displayName"],
  },
  {
    model: MetaSource,
    as: "defaultSubSource",
    attributes: ["id", "key", "displayName"],
  },
];

export const listAccounts = async () => {
  const accounts = await MetaAccount.findAll({
    order: [["createdAt", "ASC"]],
    include: SOURCE_INCLUDE,
  });

  return accounts.map((account) => account.toSafeJSON());
};

export const createAccount = async (data = {}) => {
  assertCryptoReady();

  if (!data.name || !data.pageId || !data.pageToken) {
    throw httpError("name, pageId and pageToken are required", 400);
  }

  const pageId = String(data.pageId).trim();

  const clash = await MetaAccount.findOne({ where: { pageId } });

  // The unique index would catch this, but a named 409 is a better answer than
  // a constraint violation mapped to a generic message.
  if (clash) {
    throw httpError(`Page ${pageId} is already connected as "${clash.name}"`, 409);
  }

  const account = await MetaAccount.create({
    name: String(data.name).trim(),
    pageId,
    pageTokenEnc: encrypt(data.pageToken),
    defaultSourceId: data.defaultSourceId || null,
    defaultSubSourceId: data.defaultSubSourceId || null,
    defaultCourseId: data.defaultCourseId || null,
    enabled: data.enabled === undefined ? true : Boolean(data.enabled),
    tokenStatus: META_TOKEN_STATUS.UNKNOWN,
  });

  await account.reload({ include: SOURCE_INCLUDE });

  return account.toSafeJSON();
};

export const updateAccount = async (id, data = {}) => {
  const account = await getAccountOrThrow(id);

  if (data.name !== undefined) account.name = String(data.name).trim();
  if (data.pageId !== undefined) account.pageId = String(data.pageId).trim();

  if (data.defaultSourceId !== undefined) {
    account.defaultSourceId = data.defaultSourceId || null;
  }
  if (data.defaultSubSourceId !== undefined) {
    account.defaultSubSourceId = data.defaultSubSourceId || null;
  }
  if (data.defaultCourseId !== undefined) {
    account.defaultCourseId = data.defaultCourseId || null;
  }
  if (data.enabled !== undefined) account.enabled = Boolean(data.enabled);

  /**
   * A blank token means "keep the existing one".
   *
   * The panel cannot show the current token — it is never sent to the browser —
   * so an edit dialog necessarily opens with an empty field. Treating empty as
   * "clear it" would delete a working credential every time somebody renamed an
   * account.
   */
  if (data.pageToken) {
    assertCryptoReady();
    account.pageTokenEnc = encrypt(data.pageToken);
    account.tokenStatus = META_TOKEN_STATUS.UNKNOWN;
    account.tokenCheckedAt = null;
    account.lastError = null;
    // A new token deserves a fresh alert if it too turns out to be broken.
    account.alertedAt = null;
  }

  await account.save();
  await account.reload({ include: SOURCE_INCLUDE });

  return account.toSafeJSON();
};

export const deleteAccount = async (id) => {
  const account = await getAccountOrThrow(id);
  const { name } = account;

  // Cascades to meta_forms and meta_leads.
  await account.destroy();

  return { name };
};

/**
 * Mark a token dead and alert, once.
 *
 * Called from wherever Graph reports code 190 — validate, sync or the poll —
 * so the flag and the email cannot get out of step.
 */
export const markTokenInvalid = async (account, message) => {
  account.tokenStatus = META_TOKEN_STATUS.INVALID;
  account.tokenCheckedAt = new Date();
  account.lastError = message;
  await account.save();

  // Detached: an SMTP problem must not turn into a failed poll.
  void alertTokenInvalid(account, message);
};

/**
 * Ask Graph who this token belongs to.
 *
 * The cheapest possible call that proves three things at once: the token is
 * live, it is a *page* token, and it is for the page the admin typed.
 */
export const validateToken = async (id) => {
  const account = await getAccountOrThrow(id);

  try {
    const data = await graphGet(`/${account.pageId}`, {
      fields: "id,name",
      access_token: accountToken(account),
    });

    account.tokenStatus = META_TOKEN_STATUS.VALID;
    account.tokenCheckedAt = new Date();
    account.lastError = null;
    account.alertedAt = null;
    await account.save();

    return account.toSafeJSON({ pageName: data?.name || null });
  } catch (error) {
    const { message } = parseGraphError(error);

    await markTokenInvalid(account, message);

    // Graph's own sentence, verbatim — see parseGraphError.
    throw httpError(message, 400);
  }
};

/**
 * Refresh the cached form list from Graph.
 *
 * The **only** caller of `/leadgen_forms`. The poll deliberately never touches
 * it: reading the form list on every cycle would be one extra request per
 * account every five minutes to fetch a list that changes a few times a year.
 *
 * Never writes the mapping columns. An admin's routing is not a background
 * job's to revert.
 */
export const syncForms = async (id) => {
  const account = await getAccountOrThrow(id);

  try {
    const data = await graphGet(`/${account.pageId}/leadgen_forms`, {
      access_token: accountToken(account),
      fields: "id,name,status",
      limit: 200,
    });

    const forms = data?.data || [];
    const now = new Date();

    let created = 0;
    let updated = 0;

    for (const form of forms) {
      const [row, isNew] = await MetaForm.findOrCreate({
        where: { accountId: account.id, formId: form.id },
        defaults: {
          accountId: account.id,
          formId: form.id,
          name: form.name || null,
          status: form.status || null,
          active: true,
          lastSeenAt: now,
        },
      });

      if (isNew) {
        created += 1;
        continue;
      }

      // Label and status only — never source/subSource/courseId/active.
      row.name = form.name || row.name;
      row.status = form.status || row.status;
      row.lastSeenAt = now;
      await row.save();
      updated += 1;
    }

    account.lastSyncedAt = now;
    account.tokenStatus = META_TOKEN_STATUS.VALID;
    account.lastError = null;
    await account.save();

    await markSynced(now);

    logger.info("Meta form sync complete", {
      accountId: account.id,
      total: forms.length,
      created,
      updated,
    });

    return { accountId: account.id, total: forms.length, created, updated };
  } catch (error) {
    const { message } = parseGraphError(error);

    if (isInvalidTokenError(error)) {
      await markTokenInvalid(account, message);
    } else {
      account.lastError = message;
      await account.save();
    }

    logger.error("Meta form sync failed", { accountId: account.id, message });

    throw httpError(message, 400);
  }
};

/**
 * Sync every enabled account.
 *
 * One account's dead token must not stop the others syncing, so failures are
 * collected into the result rather than thrown.
 */
export const syncAllEnabled = async () => {
  const accounts = await MetaAccount.findAll({ where: { enabled: true } });

  const results = [];

  for (const account of accounts) {
    try {
      results.push(await syncForms(account.id));
    } catch (error) {
      results.push({ accountId: account.id, error: error.message });
    }
  }

  return results;
};
