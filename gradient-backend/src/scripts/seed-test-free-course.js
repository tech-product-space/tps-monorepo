/**
 * Seeds one published free course with every field the listing card renders,
 * so the beta listing page has something real to show end to end.
 *
 *   node src/scripts/seed-test-free-course.js            # dry run
 *   node src/scripts/seed-test-free-course.js --confirm  # writes
 *   node src/scripts/seed-test-free-course.js --confirm --force  # recreate
 *
 * Safe to re-run: an existing course is reported and left alone unless
 * --force is passed, which deletes it and its modules/lessons first.
 */

import db from "../database/postgres/models/index.js";

const { FreeCourse, FreeCourseModule, FreeCourseLesson, sequelize } = db;

const CONFIRM = process.argv.includes("--confirm");
const FORCE = process.argv.includes("--force");

const SLUG = "deep-dive-into-data-structure-and-algo";

const COURSE = {
  title: "Deep dive into Data Structure & Algo",
  subTitle: "Build the problem-solving muscle interviews actually test",
  description:
    "Python is a high-level, object-oriented popular programming language developed by Guido van Rossum. Work through arrays, hashing, trees and graphs by building the data structures yourself before reaching for the library version.",
  slug: SLUG,
  thumbnail: "",
  isPublished: true,

  author: {
    name: "Ashish Gambhir",
    company: "Winzo",
    designation: "Senior Software Engineer",
    imageKey: "",
    linkedIn: "https://www.linkedin.com/",
  },

  // Index order is fixed by the admin form and the detail page's sticky card:
  // 0 Modules, 1 Duration, 2 Lessons, 3 Challenges, 4 Language.
  // The listing card reads 0 and 1.
  rightCard: {
    0: "5 Modules",
    1: "7 Hours",
    2: "18 Lessons",
    3: "24 Challenges",
    4: "Language: English",
  },

  curriculum: {
    heading: "What the course covers",
    subTitle: "Five modules, each ending in a timed problem set.",
  },

  whatYouWillLearn: {
    heading: "What you will learn",
    points: [
      "Pick the right data structure for a problem instead of guessing",
      "Reason about time and space complexity without memorising tables",
      "Recognise the handful of patterns most interview questions reduce to",
      "Write recursive solutions you can actually debug",
    ],
  },

  whoShouldAttend: {
    heading: "Who should attend",
    points: [
      "Engineers with 0-4 years of experience preparing for interviews",
      "Self-taught developers who skipped the CS fundamentals",
      "Anyone who can write code but freezes on a whiteboard",
    ],
  },

  certificate: {
    heading: "Completion Certificate",
    imageKey: "",
  },

  seo: {
    metaTitle: "Deep dive into Data Structure & Algo | Free Course",
    metaDescription:
      "A free, hands-on data structures and algorithms course. Arrays, hashing, trees, graphs and the patterns behind common interview questions.",
    metaKeywords: "dsa course, data structures, algorithms, free dsa course",
  },

  faq: [
    {
      index: 0,
      question: "Is this course really free?",
      answer: "Yes. Every module and the completion certificate cost nothing.",
    },
    {
      index: 1,
      question: "Do I need prior programming experience?",
      answer:
        "You should be comfortable writing basic loops and functions in any one language. The course does not teach syntax.",
    },
  ],
};

// Five modules so the seeded moduleCount matches the "5 Modules" label above.
const MODULES = [
  {
    title: "Arrays & Strings",
    subTitle: "Two pointers, sliding windows and prefix sums",
    lessons: ["Why arrays are fast", "The two-pointer pattern", "Sliding windows"],
  },
  {
    title: "Hashing",
    subTitle: "Hash maps, sets and collision handling",
    lessons: ["Building a hash map", "When hashing beats sorting"],
  },
  {
    title: "Recursion & Backtracking",
    subTitle: "Reading a recursive call as a tree",
    lessons: ["Base cases that terminate", "Backtracking on permutations"],
  },
  {
    title: "Trees",
    subTitle: "Traversals, BSTs and balancing",
    lessons: ["Depth-first traversals", "Binary search trees", "Balancing"],
  },
  {
    title: "Graphs",
    subTitle: "BFS, DFS and shortest paths",
    lessons: ["Representing a graph", "BFS vs DFS", "Dijkstra by hand"],
  },
];

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function main() {
  const existing = await FreeCourse.findOne({ where: { slug: SLUG } });

  if (existing && !FORCE) {
    console.log(
      `Course "${SLUG}" already exists (${existing.id}). Nothing to do.`,
    );
    console.log("Pass --force to delete and recreate it.");
    return;
  }

  const lessonTotal = MODULES.reduce((sum, m) => sum + m.lessons.length, 0);

  if (!CONFIRM) {
    console.log("DRY RUN — nothing written. Re-run with --confirm.\n");
    if (existing) {
      console.log(`Would DELETE existing course ${existing.id} (--force).`);
    }
    console.log(`Would create course : ${COURSE.title}`);
    console.log(`             slug   : ${SLUG}`);
    console.log(`             author : ${COURSE.author.name} • ${COURSE.author.company}`);
    console.log(`             modules: ${MODULES.length}`);
    console.log(`             lessons: ${lessonTotal}`);
    console.log(`             rightCard[0]: ${COURSE.rightCard[0]}`);
    console.log(`             rightCard[1]: ${COURSE.rightCard[1]}`);
    return;
  }

  await sequelize.transaction(async (transaction) => {
    if (existing) {
      const staleModules = await FreeCourseModule.findAll({
        where: { freeCourseId: existing.id },
        attributes: ["id"],
        transaction,
      });

      await FreeCourseLesson.destroy({
        where: { freeCourseModuleId: staleModules.map((m) => m.id) },
        transaction,
      });

      await FreeCourseModule.destroy({
        where: { freeCourseId: existing.id },
        transaction,
      });

      await FreeCourse.destroy({ where: { id: existing.id }, transaction });

      console.log(`Deleted existing course ${existing.id}.`);
    }

    const course = await FreeCourse.create(COURSE, { transaction });

    for (const [index, module] of MODULES.entries()) {
      const created = await FreeCourseModule.create(
        {
          freeCourseId: course.id,
          title: module.title,
          subTitle: module.subTitle,
          slug: slugify(module.title),
          order: index,
          isPublished: true,
          overview: { heading: module.title, subTitle: module.subTitle },
          seo: {},
        },
        { transaction },
      );

      for (const [lessonIndex, lessonTitle] of module.lessons.entries()) {
        await FreeCourseLesson.create(
          {
            freeCourseModuleId: created.id,
            title: lessonTitle,
            slug: slugify(lessonTitle),
            order: lessonIndex,
            isPublished: true,
            // Matches the shape the lesson player already reads.
            content: {
              type: "text",
              body: `<p>Placeholder copy for "${lessonTitle}".</p>`,
            },
            seo: {},
          },
          { transaction },
        );
      }
    }

    console.log(
      `\n✅ Created course ${course.id} with ${MODULES.length} modules and ${lessonTotal} lessons.`,
    );
    console.log(`   Visit /free-courses/${SLUG}`);
    console.log(
      "   Note: thumbnail is empty — upload one in the admin panel so the card icon renders.",
    );
  });
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
