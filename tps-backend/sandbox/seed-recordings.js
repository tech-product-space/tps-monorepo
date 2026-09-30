/**
 * Demo recordings, for testing the public /recordings listing against something
 * that actually fills a grid.
 *
 *   node sandbox/seed-recordings.js          insert whatever is missing
 *   node sandbox/seed-recordings.js --clean  remove every row it made
 *
 * Deliberately in `sandbox/` and not in `seeders/`: a sequelize seeder runs
 * wherever `db:seed:all` runs, and this is fixture data that must never reach
 * production. Every slug is prefixed `demo-`, which is both how re-running stays
 * idempotent and how `--clean` knows what is safe to delete.
 *
 * Thumbnails are real objects already in the bucket (the `events/` folder), so
 * the cards render at the right aspect with real artwork rather than grey
 * boxes. They are URL-encoded here because several of the keys contain spaces
 * and brackets, and the card hands `thumbnail` straight to `next/image`.
 */
require("dotenv").config();

const db = require("../models");
const { Recording, RecordingCategory } = db;

const CLEAN = process.argv.includes("--clean");

/** Enough rows to overflow the public page size of 12 and prove "Load more". */
const COUNT_NOTE = "14 rows against a page size of 12 — page 2 exists.";

const THUMBNAILS = [
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1787738239580-B3%20(1).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1787652514621-B%20(21).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1787554255859-B%20(17).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1787547327955-B%20(16).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1787366801450-B%20(16).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1787365498034-B%20(14).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1786973348702-23rd.png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1786347326224-B%20(10).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1786073568967-Build%20AI%20Agents%20-%20Banner%2010.png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1786072803021-B%20(10).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1786001156985-B%20(9).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1786000430468-B%20(8).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1785998336329-B%20(7).png",
  "https://tps-storage.s3.ap-south-1.amazonaws.com/events/1785997721880-B%20(5).png",
];

/**
 * `categorySlug` matches the seeded chips. One row is deliberately left
 * `uncategorised` and one deliberately has no `format`, because both are states
 * the card has to survive and neither shows up in tidy fixture data.
 */
const RECORDINGS = [
  {
    slug: "demo-ai-first-pm-workflows",
    title: "AI-First PM Workflows: Shipping Faster With LLMs In The Loop",
    subtitle:
      "Where models actually help a product manager, and where they quietly waste a sprint.",
    format: "Masterclass",
    categorySlug: "ai-for-pms",
    durationMinutes: 98,
    attendeeCount: 2987,
    speaker: {
      name: "Rutvik Acharya",
      title: "Principal Data Scientist",
      company: "Atlassian",
    },
  },
  {
    slug: "demo-teardown-zomato-district",
    title: "Teardown: What Zomato Got Right With District",
    subtitle:
      "A live product teardown of the going-out app, from positioning to retention loops.",
    format: "Teardown",
    categorySlug: "case-studies-teardowns",
    durationMinutes: 64,
    attendeeCount: 1840,
    speaker: {
      name: "Ananya Menon",
      title: "Group Product Manager",
      company: "Swiggy",
    },
  },
  {
    slug: "demo-metrics-that-survive-a-board-review",
    title: "Metrics That Survive A Board Review",
    subtitle:
      "Choosing a north star that does not fall apart the moment somebody asks how it is computed.",
    format: "Workshop",
    categorySlug: "product-analytics",
    durationMinutes: 75,
    attendeeCount: 1206,
    speaker: {
      name: "Karthik Raman",
      title: "Director of Product",
      company: "Razorpay",
    },
  },
  {
    slug: "demo-pm-interview-case-clinic",
    title: "PM Interview Case Clinic: Product Sense, Live",
    subtitle:
      "Three candidates, three cases, and the follow-up questions interviewers actually ask.",
    format: "Workshop",
    categorySlug: "interview-prep",
    durationMinutes: 122,
    attendeeCount: 3410,
    speaker: {
      name: "Nikita Sharma",
      title: "Senior Product Manager",
      company: "Google",
    },
  },
  {
    slug: "demo-from-engineer-to-pm",
    title: "From Engineer To PM Without Starting Over",
    subtitle:
      "What transfers, what does not, and how to make the first ninety days count.",
    format: "Masterclass",
    categorySlug: "career-transitions",
    durationMinutes: 58,
    attendeeCount: 2210,
    speaker: {
      name: "Devansh Kapoor",
      title: "Product Lead",
      company: "Zerodha",
    },
  },
  {
    slug: "demo-roadmaps-that-hold-up",
    title: "Roadmaps That Hold Up When Priorities Change",
    subtitle:
      "Planning at a level of detail that survives contact with the quarter.",
    format: "Workshop",
    categorySlug: "product-strategy",
    durationMinutes: 81,
    attendeeCount: 1533,
    speaker: {
      name: "Meera Iyer",
      title: "VP Product",
      company: "CRED",
    },
  },
  {
    slug: "demo-build-an-ai-agent-in-a-weekend",
    title: "Build An AI Agent In A Weekend",
    subtitle:
      "A hands-on build: tools, memory, evals, and the parts nobody demos.",
    format: "Hackathon",
    categorySlug: "ai-for-pms",
    durationMinutes: 187,
    attendeeCount: 4120,
    speaker: {
      name: "Arjun Bhatt",
      title: "Staff Engineer",
      company: "Postman",
    },
  },
  {
    slug: "demo-pricing-for-early-stage-products",
    title: "Pricing For Early-Stage Products",
    subtitle:
      "Packaging, willingness to pay, and why your first price is a research instrument.",
    format: "Masterclass",
    categorySlug: "product-strategy",
    durationMinutes: 69,
    attendeeCount: 980,
    speaker: {
      name: "Shreya Nair",
      title: "Head of Growth",
      company: "Freshworks",
    },
  },
  {
    slug: "demo-experimentation-without-enough-traffic",
    title: "Experimentation When You Do Not Have Enough Traffic",
    subtitle:
      "Reading a test that will never reach significance, without lying to yourself.",
    format: "Workshop",
    categorySlug: "product-analytics",
    durationMinutes: 54,
    attendeeCount: 760,
    speaker: {
      name: "Vikram Desai",
      title: "Principal PM, Analytics",
      company: "Meesho",
    },
  },
  {
    slug: "demo-writing-prds-people-read",
    title: "Writing PRDs People Actually Read",
    subtitle:
      "Structure, length, and the one section most documents are missing.",
    format: "Masterclass",
    categorySlug: "product-management",
    durationMinutes: 47,
    attendeeCount: 1670,
    speaker: {
      name: "Priya Ranganathan",
      title: "Senior Product Manager",
      company: "Flipkart",
    },
  },
  {
    slug: "demo-teardown-notion-onboarding",
    title: "Teardown: Notion's Onboarding, Screen By Screen",
    subtitle:
      "Why an empty document is the hardest first-run experience in software.",
    format: "Teardown",
    categorySlug: "case-studies-teardowns",
    durationMinutes: 72,
    attendeeCount: 2044,
    speaker: {
      name: "Rohan Gupta",
      title: "Product Design Lead",
      company: "Zoho",
    },
  },
  {
    slug: "demo-user-research-on-no-budget",
    title: "User Research On No Budget",
    subtitle:
      "Five interviews, done properly, beat five hundred survey responses.",
    format: "Workshop",
    categorySlug: "product-management",
    durationMinutes: 63,
    attendeeCount: 1120,
    speaker: {
      name: "Aisha Qureshi",
      title: "Head of Research",
      company: "PhonePe",
    },
  },
  {
    slug: "demo-breaking-into-ai-product-roles",
    title: "Breaking Into AI Product Roles In 2026",
    subtitle:
      "What hiring managers are screening for now that everyone lists an LLM project.",
    // No `format` on purpose: the card has to render without the pill.
    format: null,
    categorySlug: "career-transitions",
    durationMinutes: 91,
    attendeeCount: 3300,
    speaker: {
      name: "Sanjay Varma",
      title: "Director, AI Products",
      company: "Microsoft",
    },
  },
  {
    slug: "demo-a-session-with-no-category",
    title: "Office Hours: Ask A Product Leader Anything",
    subtitle:
      "An unstructured hour of questions from the community, answered live.",
    format: "Masterclass",
    // Uncategorised on purpose: it must still appear under "All".
    categorySlug: null,
    durationMinutes: 105,
    attendeeCount: 1490,
    speaker: {
      name: "Lakshmi Prasad",
      title: "Chief Product Officer",
      company: "Urban Company",
    },
  },
];

/** Any 11-character id. The listing never sees it — the gate holds it back. */
const videoBlock = (index) => ({
  provider: "youtube",
  url: `https://www.youtube.com/watch?v=demoVID${String(index).padStart(3, "0")}`,
  videoId: `demoVID${String(index).padStart(3, "0")}`,
  isUnlisted: false,
});

const run = async () => {
  if (CLEAN) {
    const removed = await Recording.destroy({
      where: { slug: { [db.Sequelize.Op.like]: "demo-%" } },
    });
    console.log(`Removed ${removed} demo recordings.`);
    return;
  }

  const categories = await RecordingCategory.findAll({
    attributes: ["id", "slug"],
  });
  const categoryId = new Map(categories.map((row) => [row.slug, row.id]));

  if (!categories.length) {
    console.log(
      "No recording categories found — run the category seeder first, or the demo rows land uncategorised."
    );
  }

  let created = 0;
  let skipped = 0;

  for (const [index, item] of RECORDINGS.entries()) {
    const existing = await Recording.findOne({ where: { slug: item.slug } });
    if (existing) {
      skipped += 1;
      continue;
    }

    // Staggered a day apart, newest first in the list: `publishedAt DESC` is
    // the grid's sort, and identical timestamps make paging non-deterministic.
    const publishedAt = new Date(Date.now() - index * 24 * 60 * 60 * 1000);

    await Recording.create({
      slug: item.slug,
      title: item.title,
      subtitle: item.subtitle,
      categoryId: item.categorySlug
        ? (categoryId.get(item.categorySlug) ?? null)
        : null,
      thumbnail: THUMBNAILS[index % THUMBNAILS.length],
      video: videoBlock(index),
      durationMinutes: item.durationMinutes,
      host: {
        name: "The Product Space",
      },
      speakers: [
        {
          name: item.speaker.name,
          title: item.speaker.title,
          company: item.speaker.company,
          bio: `${item.speaker.name} is ${item.speaker.title} at ${item.speaker.company}, and has spent the last decade shipping products people actually use. This session is the version of that experience they wish someone had given them at the start.`,
          // Local `public/` paths on the website, which is where these logos
          // live — `next/image` treats a relative src as same-origin, so no
          // upload and no `remotePatterns` entry is needed for fixture data.
          previouslyAt: [
            { name: "Google", logo: "/assets/companylogo/google.png" },
            { name: "Microsoft", logo: "/assets/companylogo/microsoft.png" },
            { name: "Postman", logo: "/assets/companylogo/postman.png" },
          ],
        },
      ],
      content: {
        whatYouWillLearn: `<ul><li><strong>Build from real customer pain.</strong> The instinct you only develop by being in the room when things break.</li><li><strong>${item.subtitle}</strong> A concrete week-by-week playbook, not a framework diagram.</li><li><strong>Avoid the two mistakes that kill products.</strong> Why teams overbuild things nobody asked for, or underbuild things that collapse.</li></ul>`,
        whyThisMatters: `<p>${item.title} was one of the sessions people asked for the recording of most often. Every company you admire builds this way; the gap is rarely knowledge and almost always practice. This is the full session, unedited.</p>`,
        keyTakeaways: `<ul><li>A repeatable way to decide what to build next.</li><li>The two or three numbers worth arguing about.</li><li>What to do in your first week back at your desk.</li></ul>`,
      },
      seo: {
        title: item.title,
        description: item.subtitle,
        keywords: [],
      },
      settings: {},
      format: item.format,
      attendeeCount: item.attendeeCount,
      viewCount: 0,
      isPublished: true,
      publishedAt,
      scheduledAt: null,
    });

    created += 1;
  }

  console.log(`Created ${created}, already present ${skipped}. ${COUNT_NOTE}`);
  console.log("Remove them again with: node sandbox/seed-recordings.js --clean");
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.sequelize.close());
