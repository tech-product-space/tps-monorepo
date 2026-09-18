import env from "../../config/env.js";

/**
 * Absolute URL of an uploaded file. The bucket is fronted by a CDN domain, the
 * same one `resolveStorageUrl` uses on the websites.
 */
export const resolveStorageUrl = (key) =>
  key ? `${env.assets.baseUrl}/${key}` : "";

/** Public origin of this API, honouring the proxy headers in front of it. */
export const getRequestBaseUrl = (req) => {
  const protocol = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("x-forwarded-host") || req.get("host");

  return `${protocol}://${host}`;
};

/**
 * Stable brochure link, safe to paste into an email template by hand.
 *
 * It resolves to whatever file is currently uploaded, so replacing the brochure
 * does not break links already sitting in saved templates or sent emails — the
 * raw S3 key would, since it carries an upload timestamp.
 */
export const buildBrochureLink = (req, slug) =>
  `${getRequestBaseUrl(req)}/courses/public/${slug}/brochure`;
