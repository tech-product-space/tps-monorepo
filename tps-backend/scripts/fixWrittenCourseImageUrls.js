require("dotenv").config();

const { CourseModuleLesson } = require("../models");

/**
 * Repairs image and video URLs saved with the wrong prefix.
 *
 * `uploadWrittenCourseFile` used to build its response URL from
 * `AWS_BLOG_BUCKET_URL`, which is not the bucket root — it already ends in
 * `/blogs`. So an object stored at `written-course/<courseId>/<file>` was
 * reported back as `.../blogs/written-course/<courseId>/<file>`, and S3 answers
 * a request for a key that is not there — with no ListBucket permission — as
 * Access Denied rather than Not Found.
 *
 * The uploads themselves were fine; only the URL written into the lesson was
 * wrong. This rewrites those URLs in place. Nothing is re-uploaded and no S3
 * object is touched.
 *
 * Only v2 (Tiptap) lessons carry a resolved URL — v1 blocks store the S3 key and
 * resolve it at render time, so they were never affected — but both are scanned
 * anyway, since a stray URL costs nothing to check for.
 *
 *   node scripts/fixWrittenCourseImageUrls.js          # dry run, prints what it would change
 *   node scripts/fixWrittenCourseImageUrls.js --apply  # writes
 *
 * Windows PowerShell has no inline env prefix — use:
 *   $env:NODE_ENV="development"; node scripts/fixWrittenCourseImageUrls.js
 */

const APPLY = process.argv.includes("--apply");

const cdn = (process.env.AWS_ASSETS_CLOUDFRONT_DOMAIN || "").replace(/\/$/, "");
const blogBase = (process.env.AWS_BLOG_BUCKET_URL || "").replace(/\/$/, "");

if (!blogBase) {
  console.error("AWS_BLOG_BUCKET_URL is not set — nothing to match against.");
  process.exit(1);
}

if (!cdn) {
  console.error(
    "AWS_ASSETS_CLOUDFRONT_DOMAIN is not set — cannot build the corrected URL.",
  );
  process.exit(1);
}

// What the bug produced, e.g.
// https://tps-storage.s3.ap-south-1.amazonaws.com/blogs/written-course/…
const BROKEN_PREFIX = `${blogBase}/written-course/`;
const FIXED_PREFIX = `${cdn}/written-course/`;

const run = async () => {
  const lessons = await CourseModuleLesson.findAll({
    attributes: ["id", "title", "content"],
  });

  let changed = 0;

  for (const lesson of lessons) {
    const before = JSON.stringify(lesson.content ?? {});

    if (!before.includes(BROKEN_PREFIX)) continue;

    // Operating on the serialised document rather than walking the node tree:
    // the same URL can appear in an image `src`, a video `src` or a `poster`,
    // and a string replace catches every one of them without this script
    // needing to know the schema.
    const after = before.split(BROKEN_PREFIX).join(FIXED_PREFIX);
    const hits = before.split(BROKEN_PREFIX).length - 1;

    changed += 1;
    console.log(
      `${APPLY ? "fixing " : "would fix"}  ${lesson.id}  ${hits} url${hits === 1 ? "" : "s"}  ${lesson.title}`,
    );

    if (APPLY) {
      await lesson.update({ content: JSON.parse(after) });
    }
  }

  console.log(
    changed === 0
      ? "\nNo lessons carry the broken prefix."
      : `\n${APPLY ? "Updated" : "Would update"} ${changed} lesson${changed === 1 ? "" : "s"}.` +
          (APPLY ? "" : "\nRe-run with --apply to write."),
  );
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
