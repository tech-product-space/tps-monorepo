// --- Slug helper ---
const toSlug = (s = '') =>
  s
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');

const isValidSlug = (s = '') => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);

// Returns `base` if it is not in `taken`, else the first free `base-2`, `base-3`, ...
// `taken` is a Set of slugs already in use; callers should add the returned slug to
// it so repeated calls within one batch stay unique.
const uniqueSlug = (base = '', taken = new Set()) => {
    const root = toSlug(base) || 'item';
    if (!taken.has(root)) return root;

    let n = 2;
    while (taken.has(`${root}-${n}`)) n++;
    return `${root}-${n}`;
};

module.exports = {
    toSlug,
    isValidSlug,
    uniqueSlug
}