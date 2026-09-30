import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  syncForms,
  updateAccount,
  validateToken,
} from "../../services/meta/metaAccount.service.js";

/**
 * Facebook Page accounts. Super Admin only — see the router.
 *
 * The service layer owns the logic because the sync job calls the same code;
 * these are thin on purpose.
 */

export const list = asyncWrapper(async (req, res) => {
  const accounts = await listAccounts();

  return res.json({ success: true, data: accounts });
});

export const create = asyncWrapper(async (req, res) => {
  const account = await createAccount(req.body);

  return res.status(201).json({
    success: true,
    message: "Facebook account connected",
    data: account,
  });
});

export const update = asyncWrapper(async (req, res) => {
  const account = await updateAccount(req.params.id, req.body);

  return res.json({
    success: true,
    message: "Facebook account updated",
    data: account,
  });
});

export const remove = asyncWrapper(async (req, res) => {
  const { name } = await deleteAccount(req.params.id);

  // The automatic label lookup cannot run once the row is gone.
  req.activity?.set({ entityLabel: name });

  return res.json({
    success: true,
    message: "Facebook account removed",
  });
});

/**
 * Ask Graph who this token belongs to.
 *
 * Graph's error message is passed through untouched. "(#190) This method must
 * be called with a Page Access Token" is the single most common mistake when
 * connecting a page, and it names its own fix — anything we wrote instead
 * would be less useful.
 */
export const validate = asyncWrapper(async (req, res) => {
  const account = await validateToken(req.params.id);

  return res.json({
    success: true,
    message: "Token is valid",
    data: account,
  });
});

export const sync = asyncWrapper(async (req, res) => {
  const result = await syncForms(req.params.id);

  return res.json({
    success: true,
    message: `Synced ${result.total} form(s) — ${result.created} new, ${result.updated} updated`,
    data: result,
  });
});
