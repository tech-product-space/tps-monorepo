const COURSE_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
});

const COURSE_MODULE_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
});

const COURSE_LESSON_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
});

const COURSE_TYPE = Object.freeze({
  ONLINE: "online",
  OFFLINE: "offline",
});

// Which editor wrote a lesson's `content`, and so which renderer reads it back.
// BLOCKS is the original block builder ({ blocks: [] }); TIPTAP is the document
// editor ({ doc: {...} }). Rows created before the split default to BLOCKS.
const LESSON_CONTENT_VERSION = Object.freeze({
  BLOCKS: 1,
  TIPTAP: 2,
});

module.exports = {
  COURSE_STATUS,
  COURSE_TYPE,
  COURSE_MODULE_STATUS,
  COURSE_LESSON_STATUS,
  LESSON_CONTENT_VERSION,
};
