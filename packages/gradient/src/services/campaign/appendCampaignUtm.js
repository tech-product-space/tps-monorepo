/**
 * Stamps campaign UTM parameters onto every link in an email body.
 *
 * This is the whole of the campaign's conversion tracking, and it costs one
 * function — because the public site already captures `utm_*` on arrival
 * (`provider/tracking-provider.tsx`) and stamps them onto every lead,
 * subscriber, enrolment and registration it creates. Nothing new has to be
 * built to read them: after a send,
 *
 *   SELECT COUNT(*) FROM leads WHERE "utmCampaign" = :campaignId
 *
 * answers "what came of that campaign" in leads rather than in opens. See
 * plan §9.3.
 *
 * Regex rather than a DOM parser on purpose: there is no jsdom in this project,
 * the input is Tiptap's own well-formed output, and the transformation is
 * confined to the `href` of an anchor.
 */

const HREF_RE = /(<a\b[^>]*?\bhref\s*=\s*")([^"]*)(")/gi;

const DEFAULTS = Object.freeze({
  utm_source: "email",
  utm_medium: "campaign",
});

/**
 * @param {string} html        the campaign body
 * @param {string} campaignId  becomes `utm_campaign`
 * @param {object} [options]
 * @param {string[]} [options.skipContaining]  substrings that mark a link as
 *   off-limits — the unsubscribe link above all, which must reach the API
 *   exactly as it was signed.
 */
export const appendCampaignUtm = (html, campaignId, options = {}) => {
  if (!html || !campaignId) return html;

  const skip = options.skipContaining ?? ["/unsubscribe"];

  return html.replace(HREF_RE, (match, prefix, href, suffix) => {
    const url = href.trim();

    // Anything that is not a web link: mailto:, tel:, #anchor, {{token}}, or a
    // relative path with no host to attribute the visit to.
    if (!/^https?:\/\//i.test(url)) return match;

    if (skip.some((fragment) => url.includes(fragment))) return match;

    let parsed;

    try {
      parsed = new URL(url);
    } catch {
      // A malformed href is left exactly as the author wrote it. Rewriting a
      // link we cannot parse risks breaking one that a mail client would have
      // handled.
      return match;
    }

    // Existing utm values are the author's deliberate choice — a link already
    // tagged for a specific tracking scheme keeps it.
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
    }

    if (!parsed.searchParams.has("utm_campaign")) {
      parsed.searchParams.set("utm_campaign", campaignId);
    }

    return `${prefix}${parsed.toString()}${suffix}`;
  });
};
