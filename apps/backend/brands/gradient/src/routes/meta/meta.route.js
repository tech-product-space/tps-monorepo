import express from "express";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import { ADMIN_ROLES } from "../../config/constants/admin.js";

import {
  create,
  list,
  remove,
  sync,
  update,
  validate,
} from "../../controllers/meta/account.controller.js";
import {
  listForms,
  listAllForms,
  startBackfill,
  updateForm,
} from "../../controllers/meta/form.controller.js";
import {
  exportLeads,
  getLead,
  listFilters,
  listLeads,
  updateLeadStatus,
} from "../../controllers/meta/lead.controller.js";
import {
  getMetaSettings,
  getStats,
  listLogs,
  pollNow,
  syncAll,
  updateMetaSettings,
} from "../../controllers/meta/monitoring.controller.js";
import {
  createSource,
  deleteSource,
  listSources,
  updateSource,
} from "../../controllers/meta/source.controller.js";

const router = express.Router();

// BASE URL -> /meta
//
// Two auth levels, and the line between them is *credentials and destruction*,
// not "configuration":
//
//   • Any authenticated admin can read leads, manage the source catalogue, map
//     forms, run backfills and watch the monitoring tab. That is lead work, and
//     the people who do it are not Super Admins — a screen they cannot open is
//     a feature that does not exist.
//   • Super Admin is required to paste or replace a page access token (create
//     and update), to delete an account — which cascades to every lead imported
//     through it — and to flip the global ingestion switch.
//
// Nothing in the first group returns a token to the client: `list` reports
// `hasToken` as a boolean, and validate/sync use the stored token server-side.

router.use(adminAuth);

/* ── Leads: any authenticated admin ──────────────────────────────────────── */

// Static paths before "/:id", or "/filters" is swallowed by the detail route.
router.get("/leads/filters", listFilters);
router.get("/leads/export", exportLeads);
router.get("/leads", listLeads);
router.get("/leads/:id", getLead);
router.patch("/leads/:id", updateLeadStatus);

// The source catalogue is managed from the Meta Leads screen, so it sits on
// this side of the role split — it is lead taxonomy, not integration
// credentials. Form mapping then *picks* from it rather than typing free text.
router.get("/sources", listSources);
router.post("/sources", createSource);
router.put("/sources/:id", updateSource);
router.delete("/sources/:id", deleteSource);

/* ── Running the integration: any authenticated admin ────────────────────── */
//
// Operating the integration is lead work — mapping forms, importing history,
// checking whether the poll is healthy — and the people who do it are not
// Super Admins. None of these hand a page token to the client or accept one:
// `list` returns `hasToken` as a boolean, and validate/sync use the stored
// token server-side without ever revealing it.

router.get("/settings", getMetaSettings);

router.get("/logs", listLogs);
router.get("/stats", getStats);

router.post("/poll-now", pollNow);
router.post("/sync-all", syncAll);

router.get("/accounts", list);
router.get("/accounts/:id/forms", listForms);
// Flat, for pickers outside the Meta screen — the workflow trigger uses it.
router.get("/forms", listAllForms);
router.post("/accounts/:id/validate-token", validate);
router.post("/accounts/:id/sync-forms", sync);

router.put("/forms/:formId", updateForm);
router.post("/forms/:formId/backfill", startBackfill);

/* ── Credentials and destructive changes: Super Admin only ───────────────── */
//
// Applied per route rather than with `router.use`, because the split is no
// longer "everything below this line" — the routes above and below interleave
// on the same resource.
//
// Three things sit here:
//
//   • **Create and update** accept `pageToken`. That credential can read every
//     lead the page has ever collected, so pasting one is the most sensitive
//     action in this feature — more so than any edit, which is why create is
//     here even though it is neither editing nor deleting.
//   • **Delete** cascades to the page's forms *and* every lead imported through
//     them. It is the one action here that destroys lead data.
//   • **Settings** is the global ingestion switch. Blocking "disable this page"
//     (an account edit) while allowing "disable all ingestion" would be an
//     incoherent boundary — the second is strictly broader than the first.

const superAdmin = requireRole(ADMIN_ROLES.SUPER_ADMIN);

router.put("/settings", superAdmin, updateMetaSettings);

router.post("/accounts", superAdmin, create);
router.put("/accounts/:id", superAdmin, update);
router.delete("/accounts/:id", superAdmin, remove);

export default router;
