const JOB_SOURCE = Object.freeze({
  EXTERNAL: "external",
  CAREER: "career",
});

const JOB_STATUS = Object.freeze({
  DRAFT: "draft",       // hidden from the public site, work-in-progress
  PUBLISHED: "published", // visible on the public careers/jobs page
  CLOSED: "closed",     // hiring stopped / filled — hidden publicly, kept for records
});

module.exports = { JOB_SOURCE, JOB_STATUS };
