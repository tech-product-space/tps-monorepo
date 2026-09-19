"use strict";

const psEnv = require("@ps/env/tps");
const { sign } = require("./trackingToken");

const SKIP_PROTOCOLS = /^(mailto:|tel:|sms:|#)/i;
const TRACKING_BASE = () =>
  (psEnv.PUBLIC_TRACKING_BASE_URL || "").replace(/\/$/, "");

function mintOpenToken({ messageId, leadSourceType, leadSourceId, enrollmentId, nodeRunId }) {
  return sign({
    k: "o",
    m: messageId,
    t: leadSourceType,
    s: String(leadSourceId),
    e: enrollmentId || null,
    r: nodeRunId || null,
  });
}

function mintClickToken({ messageId, leadSourceType, leadSourceId, enrollmentId, nodeRunId, url }) {
  return sign({
    k: "c",
    m: messageId,
    t: leadSourceType,
    s: String(leadSourceId),
    e: enrollmentId || null,
    r: nodeRunId || null,
    u: url,
  });
}

/**
 * Rewrite an HTML body for tracking:
 *   - Replace every absolute http(s) <a href="..."> with a click-redirector URL.
 *   - Append a 1x1 transparent pixel pointing at the open endpoint.
 *
 * If PUBLIC_TRACKING_BASE_URL is not configured, returns the original html.
 */
function rewriteForTracking({ html, messageId, leadSourceType, leadSourceId, enrollmentId, nodeRunId }) {
  if (!html || typeof html !== "string") return { html: html || "" };
  const base = TRACKING_BASE();
  if (!base || !messageId) return { html };

  const clicksRewritten = html.replace(
    /(<a\b[^>]*\bhref\s*=\s*)("([^"]+)"|'([^']+)')/gi,
    (m, prefix, _q, dq, sq) => {
      const url = dq || sq;
      if (!url || SKIP_PROTOCOLS.test(url)) return m;
      // Only rewrite absolute http(s) — leave relative links and anchors alone.
      if (!/^https?:\/\//i.test(url)) return m;
      const tok = mintClickToken({
        messageId,
        leadSourceType,
        leadSourceId,
        enrollmentId,
        nodeRunId,
        url,
      });
      const clickUrl = `${base}/api/v1/t/c/${tok}`;
      return `${prefix}"${clickUrl}"`;
    }
  );

  const openTok = mintOpenToken({
    messageId,
    leadSourceType,
    leadSourceId,
    enrollmentId,
    nodeRunId,
  });
  const pixel = `<img src="${base}/api/v1/t/o/${openTok}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:0" />`;

  let withPixel;
  if (/<\/body>/i.test(clicksRewritten)) {
    withPixel = clicksRewritten.replace(/<\/body>/i, `${pixel}</body>`);
  } else {
    withPixel = clicksRewritten + pixel;
  }

  return { html: withPixel };
}

module.exports = { rewriteForTracking, mintOpenToken, mintClickToken };
