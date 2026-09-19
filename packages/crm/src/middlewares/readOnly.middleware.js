const { hasRestrictedWrites } = require('../config/constants/roles');

/**
 * Central write-guard for roles whose writes are confined to an allowlist
 * (today: Program Manager).
 *
 * Runs inside `authenticate`, immediately after req.user is populated, so it
 * covers every authenticated route in the app — including any router added
 * later. It fails CLOSED: a new mutating endpoint is denied to these roles
 * until it is explicitly listed below.
 *
 * The allowlist is the role's actual job. A Program Manager works the lead
 * pipeline one lead at a time, runs their own calls, and owns the
 * payment/enrollment surface end to end, plus the housekeeping calls every
 * signed-in user needs (logout, push subscriptions, linking their own Google
 * account).
 *
 * Deliberately NOT allowlisted:
 *   PUT /leads/bulk — the multi-select mass editor. Reassigning a block of
 *     leads between agents is the sales line's call; see canBulkEditLeads,
 *     which also gates the route so the exclusion is visible where it applies.
 *   POST /leads/import, GET /leads/export, DELETE /leads/:id — already held
 *     to narrower roles by requireRole; listing them here would not widen
 *     anything, and leaving them out keeps this guard the stricter of the two.
 *   PATCH /profiles/:id/contact — edits the shared lead profile, not the
 *     invoice. Invoices carry their own buyer_name/buyer_email fields, so
 *     billing details can be corrected without touching lead data.
 */

// Matched against the path with the /api/v<n> prefix stripped. `methods`
// narrows an entry; omit it to allow every method on that path.
const WRITE_ALLOWLIST = [
  { pattern: /^\/payment\// },            // links, record, enroll, discount, invoices, receipts
  { pattern: /^\/cohorts(\/|$)/ },        // cohort configuration
  // Ending, restoring, restarting or rescheduling an enrollment. Deliberately
  // narrow — the rest of /enrollments stays read-only. requireRole on these
  // routes is what keeps Managers and Agents out; this entry only lifts the
  // blanket read-only block so the Program Manager, who owns this surface, is
  // not 403'd before it runs.
  {
    pattern: /^\/enrollments\/[^/]+\/(drop|reinstate|re-enroll|change-cohort)$/,
    methods: ['POST'],
  },
  { pattern: /^\/email-templates(\/|$)/ },
  { pattern: /^\/whatsapp-templates(\/|$)/ },
  { pattern: /^\/settings\/business(\/|$)/ }, // business + invoice details
  // The lead pipeline, one lead at a time: create, edit (fields, status,
  // assignment, next follow-up — all of which ride on PUT /leads/:id), and
  // notes. The lookahead is what keeps /leads/bulk out: "bulk" is a legal
  // :id shape, so a plain /^\/leads\/[^/]+$/ would hand over the mass editor.
  { pattern: /^\/leads$/, methods: ['POST'] },
  { pattern: /^\/leads\/(?!bulk$)[^/]+$/, methods: ['PUT'] },
  { pattern: /^\/leads\/[^/]+\/notes$/, methods: ['POST'] },
  { pattern: /^\/leads\/notes\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  // The meetings module: book, reschedule, cancel, log an outcome. Logging an
  // outcome also moves the lead's status, which is why this belongs with the
  // lead entries above rather than being weighed on its own.
  { pattern: /^\/meetings(\/|$)/ },
  // Unlinking one's own Google account. Connecting is a GET and never reached
  // this guard; disconnecting was blocked by it despite the docblock above
  // always having claimed otherwise.
  { pattern: /^\/integrations\/google(\/|$)/ },
  { pattern: /^\/auth\/logout$/ },
  { pattern: /^\/push\// },               // own notification subscriptions
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Optional /crm: in the monorepo this app is mounted under /crm as well as at the
// root of its legacy host, and the allowlist patterns are relative to /api/vN.
const API_PREFIX = /^(?:\/crm)?\/api\/v\d+/;

// `authenticate` is mounted per-router, so req.path is relative to that
// router's mount point. originalUrl is the only reliable full path here.
const fullPath = (req) => {
  const raw = (req.originalUrl || req.url || '').split('?')[0];
  const stripped = raw.replace(API_PREFIX, '');
  return stripped.length > 1 ? stripped.replace(/\/+$/, '') : stripped;
};

const enforceReadOnly = (req, res, next) => {
  if (!req.user || !hasRestrictedWrites(req.user.role)) return next();
  if (SAFE_METHODS.has(req.method)) return next();

  const path = fullPath(req);
  const allowed = WRITE_ALLOWLIST.some(
    ({ pattern, methods }) =>
      pattern.test(path) && (!methods || methods.includes(req.method)),
  );
  if (allowed) return next();

  return res.status(403).json({
    error: 'Your role has read-only access to this area.',
    code: 'READ_ONLY_ROLE',
  });
};

module.exports = { enforceReadOnly, WRITE_ALLOWLIST };
