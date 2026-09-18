"use strict";

const { verify } = require("../../service/workflow/tracking/trackingToken");
const {
  verifyUnsubscribeToken,
} = require("../../service/workflow/tracking/unsubscribeToken");
const { recordLeadEvent } = require("../../service/workflow/events/recordLeadEvent");
const { LeadConsent, Unsubscribe } = require("../../models");
const { LEAD_EVENT_TYPE } = require("../../constants/workflow");
const { loadLead } = require("../../service/workflow/triggers/leadLoader");

// 1x1 transparent gif
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.ip || req.connection?.remoteAddress || null;
}

function userAgent(req) {
  return (req.headers["user-agent"] || "").slice(0, 512);
}

// Heuristic: mail clients prefetch the pixel before the human reads — so the
// FIRST hit within 2s of send isn't reliable. We still record it, but mark
// `prefetch_suspected` for downstream filtering. Conservative for v1.
function looksLikePrefetch(ua) {
  if (!ua) return false;
  return /GoogleImageProxy|YahooMailProxy|Outlook|Mimecast|Barracuda|Proofpoint/i.test(ua);
}

exports.trackOpen = async (req, res) => {
  // Always respond with the pixel quickly — never let recording delay the
  // response or expose internal errors to the recipient's mail client.
  res.set({
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.status(200).end(PIXEL);

  try {
    const data = verify(req.params.token);
    if (!data || data.k !== "o" || !data.m) return;

    const ua = userAgent(req);
    await recordLeadEvent({
      leadSourceType: data.t,
      leadSourceId: data.s,
      eventType: LEAD_EVENT_TYPE.EMAIL_OPENED,
      enrollmentId: data.e,
      workflowNodeRunId: data.r,
      providerMessageId: data.m,
      payload: {
        ip: clientIp(req),
        ua,
        prefetch_suspected: looksLikePrefetch(ua),
      },
      // One "opened" event per (message, day) so refreshes don't flood.
      dedupeKey: `open:${data.m}:${new Date().toISOString().slice(0, 10)}`,
    });
  } catch (err) {
    console.error("trackOpen failed:", err.message);
  }
};

exports.trackClick = async (req, res) => {
  const data = verify(req.params.token);
  if (!data || data.k !== "c" || !data.u) {
    return res.status(400).send("Invalid tracking link");
  }

  // Redirect first so the user isn't blocked behind logging.
  res.redirect(302, data.u);

  try {
    await recordLeadEvent({
      leadSourceType: data.t,
      leadSourceId: data.s,
      eventType: LEAD_EVENT_TYPE.EMAIL_CLICKED,
      enrollmentId: data.e,
      workflowNodeRunId: data.r,
      providerMessageId: data.m,
      payload: {
        url: data.u,
        ip: clientIp(req),
        ua: userAgent(req),
      },
      // One "clicked" event per (message, url) — multiple clicks on the same
      // link are usually noise.
      dedupeKey: `click:${data.m}:${hash(data.u)}`,
    });
  } catch (err) {
    console.error("trackClick failed:", err.message);
  }
};

function hash(s) {
  // Lightweight stable hash; collision-safe enough for dedupe scope.
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// GET /api/v1/u/:token — redirect to the public site's unsubscribe page,
// passing the token along so the page can confirm + POST back.
exports.unsubscribeLand = async (req, res) => {
  const data = verifyUnsubscribeToken(req.params.token);
  if (!data) {
    return res.status(400).send("Invalid or expired unsubscribe link");
  }

  const landing = (process.env.PUBLIC_SITE_BASE_URL || "").replace(/\/$/, "");
  if (landing) {
    // The site reads `token` + `type` and routes to the matching backend
    // endpoint. `type=workflow` here so the site posts back to the workflow
    // verifier (different secret + token shape from the campaign one).
    return res.redirect(
      302,
      `${landing}/unsubscribe?token=${encodeURIComponent(
        req.params.token
      )}&type=workflow`
    );
  }

  // Fallback minimal HTML when PUBLIC_SITE_BASE_URL is not configured.
  res.set("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(
    `<!doctype html><html><body style="font:14px/1.5 -apple-system,Segoe UI,Arial,sans-serif;padding:32px;max-width:480px;margin:auto"><h2>Unsubscribe</h2><p>Click the button below to stop receiving emails from us.</p><form method="post"><button type="submit" style="padding:10px 16px;background:#111;color:#fff;border:0;border-radius:6px;cursor:pointer">Unsubscribe</button></form></body></html>`
  );
};

// POST /api/v1/u/:token — workflow-aware unsubscribe. Idempotent.
// Also handles RFC-8058 one-click unsubscribe (mail clients POST here directly).
exports.unsubscribeConfirm = async (req, res) => {
  const data = verifyUnsubscribeToken(req.params.token);
  if (!data) {
    return res.status(400).json({ success: false, message: "Invalid token" });
  }

  try {
    // Resolve email up-front so we can store it on the consent row. Used by
    // the (faster) email-direct opt-out lookup added in Phase 2.
    let leadEmail = null;
    try {
      const lead = await loadLead(data.leadSourceType, data.leadSourceId);
      leadEmail = lead?.email?.trim().toLowerCase() || null;
    } catch (_) {
      // best-effort — proceed without email
    }

    const reason =
      (req.body && typeof req.body.reason === "string" && req.body.reason.trim()) ||
      "user_unsubscribed";

    const [row, created] = await LeadConsent.findOrCreate({
      where: {
        lead_source_type: data.leadSourceType,
        lead_source_id: data.leadSourceId,
      },
      defaults: {
        lead_source_type: data.leadSourceType,
        lead_source_id: data.leadSourceId,
        email: leadEmail,
        opt_out_email: true,
        opt_out_email_at: new Date(),
        opt_out_email_reason: reason,
      },
    });

    if (!created && !row.opt_out_email) {
      await row.update({
        opt_out_email: true,
        opt_out_email_at: new Date(),
        opt_out_email_reason: reason,
        email: row.email || leadEmail, // backfill if missing
      });
    }

    await recordLeadEvent({
      leadSourceType: data.leadSourceType,
      leadSourceId: data.leadSourceId,
      eventType: LEAD_EVENT_TYPE.EMAIL_UNSUBSCRIBED,
      providerMessageId: data.messageId,
      payload: { source: "one_click_or_landing", reason },
      dedupeKey: `unsub:${data.leadSourceType}:${data.leadSourceId}`,
    });

    // Dual-write into the legacy campaign-side `unsubscribes` table so any
    // code still reading from it keeps working. Best-effort — failure here
    // must not block the canonical lead_consent write above.
    if (leadEmail) {
      try {
        await Unsubscribe.findOrCreate({
          where: { email: leadEmail },
          defaults: {
            email: leadEmail,
            campaignId: null,
            reason,
          },
        });
      } catch (legacyErr) {
        console.error(
          "unsubscribeConfirm: legacy Unsubscribe mirror failed:",
          legacyErr.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "You have been unsubscribed from these emails.",
    });
  } catch (err) {
    console.error("unsubscribeConfirm failed:", err.message);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
