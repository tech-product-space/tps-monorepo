/**
 * Turns a website path into the two things the CRM shows for it: which subsource
 * it belongs to, and a label a human can read in a table cell.
 *
 * Kept as a plain ordered list rather than a settings screen on purpose — the
 * sections mirror the products we sell, which change a few times a year, not a
 * few times a week. First match wins, so specific paths must sit above general
 * ones (`/generative-ai-program/enroll` before `/generative-ai-program`).
 *
 * There is no "unmatched" outcome. Anything that falls through lands in Others
 * and is still recorded — a page nobody has classified must never cause a visit
 * to be dropped, or a new landing page would go unnoticed until someone thought
 * to look.
 *
 * Section labels must match the subsource labels seeded for the Website Visitors
 * product exactly; lead.service resolves a subsource by label within a product.
 */

const SECTIONS = [
  { prefix: '/product-management-fellowship', section: 'PM Fellowship', name: 'PM Fellowship' },
  { prefix: '/generative-ai-program', section: 'Gen AI Program', name: 'Gen AI Program' },
  { prefix: '/gen-ai-program', section: 'Gen AI Program', name: 'Gen AI Program' },
  { prefix: '/advanced-ai-program', section: 'Gen AI Program', name: 'Advanced AI Program' },
  { prefix: '/ai-builders-101', section: 'AI Builders 101', name: 'AI Builders 101' },
  { prefix: '/ai-for-product-leaders', section: 'AI for Product Leaders', name: 'AI for Product Leaders' },
  { prefix: '/events', section: 'Events', name: 'Events' },
  { prefix: '/resources', section: 'Resources', name: 'Resources' },
  { prefix: '/blogs', section: 'Blogs', name: 'Blogs' },
  { prefix: '/free-courses', section: 'Free Courses', name: 'Free Courses' },
];

const OTHERS = 'Others';

/**
 * The tail of a path, tidied for display: '/enroll' -> 'enroll',
 * '/curriculum/ai-toolkit' -> 'curriculum / ai toolkit'.
 */
const prettifyTail = (tail) => {
  const parts = tail
    .split('/')
    .filter(Boolean)
    // Ids and slugs in the path add noise without adding meaning to an agent.
    .filter((p) => !/^\d+$/.test(p))
    .map((p) => p.replace(/[-_]+/g, ' ').trim())
    .filter(Boolean);

  return parts.join(' / ');
};

/**
 * Strips query strings and hashes, and normalises a missing or bare path to '/'.
 * TPS sends whatever `usePathname` gave it, so this is defensive rather than
 * expected.
 */
const cleanPath = (url) => {
  if (!url || typeof url !== 'string') return '/';
  const path = url.split('?')[0].split('#')[0].trim();
  if (!path) return '/';
  return path.startsWith('/') ? path.replace(/\/+$/, '') || '/' : `/${path}`;
};

/**
 * @returns {{ path: string, section: string, label: string }}
 */
const describePage = (url) => {
  const path = cleanPath(url);

  if (path === '/') {
    return { path, section: OTHERS, label: 'Home page' };
  }

  const match = SECTIONS.find(
    (s) => path === s.prefix || path.startsWith(`${s.prefix}/`),
  );

  if (!match) {
    const tail = prettifyTail(path);
    return { path, section: OTHERS, label: tail || path };
  }

  const tail = prettifyTail(path.slice(match.prefix.length));

  return {
    path,
    section: match.section,
    // "PM Fellowship — enroll", or just "PM Fellowship" for the landing page.
    label: tail ? `${match.name} — ${tail}` : match.name,
  };
};

module.exports = { describePage, SECTIONS, OTHERS };
