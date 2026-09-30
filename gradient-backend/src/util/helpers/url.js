/**
 * Is this a link we are willing to publish a button for?
 *
 * The analogue of `youtube.js` refusing a URL it cannot read. A project's
 * download link is typed by an admin or pasted by a member of the public, and a
 * published project with a null or malformed link looks fine in every list and
 * is a dead button in production. Checked at publish, not on every save — a
 * draft is allowed to be incomplete.
 *
 * **`http:` and `https:` only.** Not a stylistic preference: a submission form
 * that accepted any scheme would take `javascript:alert(1)` and the frontend
 * would render it into an `href`, which is a stored XSS with extra steps.
 * `data:` and `file:` are refused for the same reason.
 *
 * This says nothing about whether the link *works* — that is the link-check
 * described in PROJECTS_PLAN.md §9, and it is deliberately a flag a human
 * reads rather than an action taken automatically.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export const isPublicHttpUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;

  let parsed;

  try {
    parsed = new URL(value.trim());
  } catch {
    // Relative, malformed, or missing a scheme entirely.
    return false;
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:";
};
