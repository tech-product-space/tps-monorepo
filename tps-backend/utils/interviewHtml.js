const sanitizeHtml = require('sanitize-html');

// Public answers are now rendered on the server, so sanitize both historical
// content on read and new content on write. Preserve supported rich formatting.
const cleanAnswerHtml = content => sanitizeHtml(String(content || ''), {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'span', 'u', 's', 'sub', 'sup'],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['class', 'style'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    td: ['colspan', 'rowspan', 'style'], th: ['colspan', 'rowspan', 'style'],
  },
  allowedStyles: {
    '*': {
      color: [/^#[\da-f]{3,8}$/i, /^rgb\([\d\s,]+\)$/i, /^[a-z]+$/i],
      'background-color': [/^#[\da-f]{3,8}$/i, /^rgb\([\d\s,]+\)$/i, /^[a-z]+$/i],
      'text-align': [/^(left|right|center|justify)$/],
    },
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedSchemesByTag: { img: ['https', 'http'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attributes) => ({ tagName, attribs: { ...attributes, rel: 'ugc noopener noreferrer' } }),
    img: (tagName, attributes) => ({ tagName, attribs: { ...attributes, loading: 'lazy' } }),
  },
});

module.exports = { cleanAnswerHtml };
