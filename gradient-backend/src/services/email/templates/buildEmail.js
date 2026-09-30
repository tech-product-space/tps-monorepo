import { gradientLayout } from "./layouts/gradient.layout.js";

/**
 * @param {object}   opts
 * @param {string}   opts.body        already-composed HTML for the message body
 * @param {Function} opts.header      from HEADERS
 * @param {Function} opts.footer      from FOOTERS
 * @param {object}   [opts.footerProps]  passed to the footer — the marketing
 *   footer needs `{ unsubscribeUrl }`; every other footer ignores it.
 */
export function buildEmail({ body, header, footer, footerProps }) {
  return gradientLayout({
    header: header(),
    body,
    footer: footer(footerProps),
  });
}
