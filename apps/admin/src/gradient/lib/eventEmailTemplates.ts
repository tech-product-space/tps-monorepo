/**
 * What the backend actually substitutes in an event email, by template type and
 * by field.
 *
 * `customBody` replaces only the keys it is handed, so any other token reaches
 * the recipient as the literal text `{{token}}`. The two senders differ, and the
 * difference is easy to miss:
 *
 *   - Certificate — certificateIssue.service.js runs **both** the subject and
 *     the body through customBody, with four variables.
 *   - Every other type — the four guest paths (public registration, admin
 *     approve/decline, bulk update, referral approval) render the body with
 *     `{ name }` alone and pass `template.subject` through untouched.
 *
 * So `{{name}}` is fine in a Certificate subject and ships as literal text in an
 * Approved one.
 */
const CERTIFICATE_TOKENS = [
  "name",
  "recipientName",
  "eventTitle",
  "certificateNo",
];

type FieldTokens = { subject: string[]; body: string[] };

const RESOLVED_TOKENS: Record<string, FieldTokens> = {
  Certificate: { subject: CERTIFICATE_TOKENS, body: CERTIFICATE_TOKENS },
};

const DEFAULT_RESOLVED_TOKENS: FieldTokens = { subject: [], body: ["name"] };

export const resolvedTokensFor = (type: string): FieldTokens =>
  RESOLVED_TOKENS[type] ?? DEFAULT_RESOLVED_TOKENS;

const TOKEN_PATTERN = /{{\s*([\w.]+)\s*}}/g;

const unresolvedIn = (text: string, allowed: string[]) => {
  const found = new Set<string>();

  for (const match of (text || "").matchAll(TOKEN_PATTERN)) {
    if (!allowed.includes(match[1])) found.add(match[1]);
  }

  return Array.from(found);
};

/** Tokens this template type will not fill in, split by the field they sit in. */
export const findUnresolvedTokens = (
  type: string,
  subject: string,
  body: string,
) => {
  const allowed = resolvedTokensFor(type);

  return {
    subject: unresolvedIn(subject, allowed.subject),
    body: unresolvedIn(body, allowed.body),
  };
};

/** Tiptap emits `<p></p>` for an empty document, so a length check is not enough. */
export const isBlankHtml = (html: string) =>
  !(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
