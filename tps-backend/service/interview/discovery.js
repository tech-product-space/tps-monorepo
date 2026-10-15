// Shared by public directory inventory and related-question selection.
const directorySlug = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const topicQuery = title => [...new Set(String(title || '').toLowerCase().match(/[a-z0-9]+/g) || [])]
  .filter(word => word.length > 2 && !new Set([
    'how', 'would', 'you', 'your', 'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are',
    'what', 'why', 'which', 'could', 'should', 'have', 'has', 'was', 'were', 'into', 'when',
    'improve', 'improvement', 'design', 'build', 'create', 'develop', 'explain', 'describe',
    'approach', 'product', 'interview', 'question', 'questions', 'use', 'using', 'system',
  ]).has(word)).join(' OR ');

function buildDirectories(rows) {
  const entries = new Map();
  for (const row of rows) {
    for (const [kind, labels] of Object.entries({ category: row.types || [], company: row.companies || [], role: row.roles || [] })) {
      for (const value of labels) {
        const label = String(value || '').trim();
        const slug = directorySlug(label);
        if (!slug || ['general', 'all'].includes(slug)) continue;
        const key = `${kind}/${slug}`;
        const entry = entries.get(key) || { kind, slug, label, ids: new Set(), lastModified: null };
        entry.ids.add(String(row.id));
        if (row.updated_at && (!entry.lastModified || new Date(row.updated_at) > new Date(entry.lastModified))) entry.lastModified = row.updated_at;
        entries.set(key, entry);
      }
    }
  }
  return [...entries.values()].map(({ ids, ...entry }) => ({ ...entry, count: ids.size }))
    .sort((a, b) => `${a.kind}/${a.slug}`.localeCompare(`${b.kind}/${b.slug}`));
}

module.exports = { directorySlug, topicQuery, buildDirectories };
