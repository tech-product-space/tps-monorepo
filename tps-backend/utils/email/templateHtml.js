"use strict";

/**
 * Library email templates — full HTML documents sent as-is.
 * See ../../../EMAIL_TEMPLATES_PLAN.md.
 *
 * A template-mode body never goes through `cleanHtml`, the `\n`→`<br>`
 * conversion or the default wrapper in `htmlHelpers.js`. Those exist for the
 * fragment the rich-text editor produces, and on a table-based layout they do
 * damage: `<p>` becomes `<div>`, every font is overwritten, and a `<br>` lands
 * between every pair of table rows.
 *
 * ── Placeholders come in three kinds ────────────────────────────────────────
 *
 *   recipient   {{name}} {{first_name}} {{email}} {{phone}}  filled per send
 *   system      {{unsubscribe_url}} {{website_url}}         filled per send
 *   field       anything else ({{event_title}}, {{register_url}} …) — filled
 *               by the admin when the template is applied, never at send
 *
 * A body with an unfilled field must not be sent: the recipient would get an
 * empty heading or a button that goes nowhere. `templateFieldKeys` is what the
 * schedule / publish checks ask.
 */

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

const RECIPIENT_KEYS = new Set(["name", "first_name", "email", "phone"]);
const SYSTEM_KEYS = new Set(["unsubscribe_url", "website_url"]);

const WEBSITE_URL = "https://theproductspace.in";

/** Every distinct placeholder key in `html`, in order of first appearance. */
const findPlaceholders = (html) => {
  const keys = [];
  for (const match of String(html || "").matchAll(PLACEHOLDER)) {
    if (!keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
};

/** `lead.name` and friends are the workflow engine's legacy recipient keys. */
const isRecipientKey = (key) =>
  RECIPIENT_KEYS.has(key) || key.startsWith("lead.");

/** Placeholders the admin still has to fill in. */
const templateFieldKeys = (html) =>
  findPlaceholders(html).filter(
    (key) => !isRecipientKey(key) && !SYSTEM_KEYS.has(key),
  );

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const firstNameOf = (name) => {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
};

/**
 * Replaces the keys present in `values`, HTML-escaped. Keys not in `values`
 * are left exactly as they are, so a later pass (or a check) can still see them.
 */
const fillPlaceholders = (html, values) =>
  String(html || "").replace(PLACEHOLDER, (match, key) => {
    const value = key
      .split(".")
      .reduce((acc, part) => (acc == null ? acc : acc[part]), values);
    return value == null ? match : escapeHtml(value);
  });

/**
 * Strips what has no business in an email and could run in the admin panel
 * when the template is previewed: scripts, frames, forms, inline event
 * handlers and `javascript:` URLs. `<style>`, `<head>`, MSO conditional
 * comments and presentational attributes are kept — email needs all of them.
 *
 * Regex rather than a parser because this repo has no HTML parser dependency,
 * and the input is staff-authored. It is defence in depth, not the only line:
 * the admin also renders previews in a sandboxed iframe.
 */
const sanitizeTemplateHtml = (html) => {
  const removed = new Set();
  let out = String(html || "");

  const strip = (pattern, label) => {
    out = out.replace(pattern, () => {
      removed.add(label);
      return "";
    });
  };

  strip(/<script\b[\s\S]*?<\/script\s*>/gi, "<script>");
  strip(/<script\b[^>]*\/?>/gi, "<script>");
  strip(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, "<iframe>");
  strip(/<(object|embed|applet)\b[\s\S]*?(<\/\1\s*>|\/?>)/gi, "<object>/<embed>");
  strip(/<\/?form\b[^>]*>/gi, "<form>");
  strip(/<(input|button|select|textarea)\b[^>]*>/gi, "form controls");
  strip(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "event handlers");

  out = out.replace(
    /(\s(?:href|src|action)\s*=\s*)(["']?)\s*javascript:[^"'\s>]*\2/gi,
    (_, attr, quote) => {
      removed.add("javascript: links");
      return `${attr}${quote}#${quote}`;
    },
  );

  return { html: out, removed: [...removed] };
};

/** `<img src>` values that are not absolute http(s) URLs — `logo.png`, `./img/a.jpg`. */
const findRelativeImages = (html) => {
  const found = [];
  for (const match of String(html || "").matchAll(
    /<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  )) {
    const src = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (!/^https?:\/\//i.test(src) && !src.startsWith("{{") && !found.includes(src)) {
      found.push(src);
    }
  }
  return found;
};

/**
 * A one-line footer for templates that carry no `{{unsubscribe_url}}` of their
 * own, on senders that get an unsubscribe link today. Placed before `</body>`
 * so it sits under the template rather than inside its layout.
 */
const unsubscribeFooter = (url) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:16px 12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">
      You&rsquo;re receiving this email because you signed up with The Product Space.
      <a href="${escapeHtml(url)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
    </td>
  </tr>
</table>`;

const injectBeforeBodyEnd = (html, snippet) =>
  /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${snippet}</body>`)
    : html + snippet;

/**
 * The template send path.
 *
 * @param html               the stored template-mode body (fields already filled)
 * @param recipient          { name, email, phone }
 * @param unsubscribeUrl     filled into {{unsubscribe_url}} when present
 * @param requireUnsubscribe inject a footer if the template has no link of its own
 * @param trackLinks         optional (html) => html — the workflow click/open
 *                           rewriter. Runs while {{unsubscribe_url}} is still
 *                           literal, so the unsubscribe link is never tracked —
 *                           the same guarantee the default wrapper gives.
 */
const renderTemplateEmail = ({
  html,
  recipient = {},
  unsubscribeUrl = null,
  requireUnsubscribe = false,
  trackLinks = null,
}) => {
  const name = recipient.name || "";

  let out = fillPlaceholders(html, {
    name,
    first_name: firstNameOf(name),
    email: recipient.email || "",
    phone: recipient.phone || "",
    lead: { name, email: recipient.email || "", phone: recipient.phone || "" },
    website_url: WEBSITE_URL,
  });

  if (typeof trackLinks === "function") out = trackLinks(out);

  const hasOwnLink = /\{\{\s*unsubscribe_url\s*\}\}/.test(out);

  out = out.replace(/\{\{\s*unsubscribe_url\s*\}\}/g, () =>
    escapeHtml(unsubscribeUrl || "#"),
  );

  if (!hasOwnLink && requireUnsubscribe && unsubscribeUrl) {
    out = injectBeforeBodyEnd(out, unsubscribeFooter(unsubscribeUrl));
  }

  // Schedule and publish refuse a body with unfilled fields; anything still
  // here is from a row saved before that check. Blank beats showing a
  // recipient raw `{{braces}}`.
  return out.replace(PLACEHOLDER, "");
};

/**
 * Whether a stored body is a library-template document rather than a fragment
 * from the rich-text editor.
 *
 * Reliable because the old editor cannot produce one: it is a `<div>` whose
 * innerHTML the browser builds, and setting innerHTML drops `<html>`, `<head>`
 * and `<!DOCTYPE>`. That is what lets the event, certificate, cohort, resource
 * and newsletter emails take templates without a "mode" column on each table —
 * the body says which it is.
 */
const isTemplateDocument = (html) =>
  /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+html|<html[\s>])/i.test(String(html || ""));

/**
 * For send sites that store a single body: renders it as a template if it is
 * one, and returns null otherwise — so the caller keeps its existing
 * cleanHtml/replacePlaceholders/wrapper path untouched:
 *
 *   const html = renderIfTemplate(body, { name }) ?? wrapEmailTemplate(...);
 *
 * `values` are this surface's own send-time placeholders (a certificate's
 * {{certificateId}}, the curriculum's {{pdf_url}}), filled escaped.
 */
const renderIfTemplate = (
  body,
  { name = "", email = "", phone = "", values = {}, unsubscribeUrl = null, requireUnsubscribe = false } = {},
) => {
  if (!isTemplateDocument(body)) return null;

  return renderTemplateEmail({
    html: fillPlaceholders(body, values),
    recipient: { name, email, phone },
    unsubscribeUrl,
    requireUnsubscribe,
  });
};

module.exports = {
  isTemplateDocument,
  renderIfTemplate,
  RECIPIENT_KEYS,
  SYSTEM_KEYS,
  findPlaceholders,
  templateFieldKeys,
  fillPlaceholders,
  sanitizeTemplateHtml,
  findRelativeImages,
  renderTemplateEmail,
  firstNameOf,
};
