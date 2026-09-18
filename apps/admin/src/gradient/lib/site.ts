/**
 * The public site's origin, for links out of the panel.
 *
 * Every "view it live" and "preview" link needs this, and before it existed the
 * domain was written out by hand in each of them — which is how the blog editor
 * and the event editor ended up pointing at `thegradient.co.in` and a bare
 * `http://gradientlearnings.org` while the site's own canonical had moved on.
 * One place to be wrong, and one place to fix.
 *
 * The trailing slash is stripped so callers can always write `${siteUrl()}/x`.
 */
export const siteUrl = (): string =>
  (process.env.NEXT_PUBLIC_SITE_URL || "https://www.gradientlearnings.org").replace(
    /\/$/,
    "",
  );
