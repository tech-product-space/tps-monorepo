/**
 * Seeds the Data Analytics program row with the values currently hardcoded on
 * the website, so switching the page over to the API changes nothing visible.
 * Starter email templates are created too, disabled, so the team can edit them
 * before anything goes out.
 *
 *   node src/scripts/seed-data-analytics-course.js            # dry run
 *   node src/scripts/seed-data-analytics-course.js --confirm  # writes
 *
 * Safe to re-run: an existing course is left untouched apart from reporting.
 */

import db from "../database/postgres/models/index.js";
import {
  COURSE_EMAIL_TYPES,
  GST_MODES,
} from "../config/constants/course.js";

const { Course, CourseEmailTemplate, sequelize } = db;
const CONFIRM = process.argv.includes("--confirm");

const SLUG = "data-analytics";

// ₹59,000 less 30% is the ₹41,300 the page shows today.
const PRICING = {
  price: 59000,
  discountPercent: 30,
  cohortDate: "2026-08-22",
  offerValidTill: "",
  offerLabel: "",
  cohortSeats: 30,
  durationLabel: "4.5 Months",
  gstMode: GST_MODES.INCLUSIVE,
  emiPlan: "6 Months",
};

const SETTINGS = {
  showEnrollButton: true,
  // Stays off until a brochure is uploaded in the admin panel.
  showBrochureButton: false,
};

// Only {{name}}, {{email}} and {{phone}} are interpolated. The brochure link is
// pasted in from the Brochure tab rather than templated, so what the editor
// shows is what lands in the inbox.
const TEMPLATES = [
  {
    type: COURSE_EMAIL_TYPES.ENROLLMENT_ACK,
    subject: "Application received — Data Analytics Program",
    body: `<div>Hi {{name}},</div>
<div><br></div>
<div>Thanks for applying to the <strong>Data Analytics Program</strong>. Your application has reached our admissions team and we have reserved your spot in the review queue.</div>
<div><br></div>
<div><strong>Here's what happens next:</strong></div>
<div>1. A counsellor calls you within 24 hours (Mon&ndash;Sat, 10am&ndash;7pm IST)</div>
<div>2. We walk you through the curriculum, the cohort schedule and the projects</div>
<div>3. If it's a fit, we share the payment options and confirm your seat</div>
<div><br></div>
<div>We'll reach you on {{phone}}, and everything else will come to {{email}}.</div>
<div><br></div>
<div>Seats in each cohort are capped so every learner gets mentor time &mdash; do pick up when we call.</div>
<div><br></div>
<div>Questions before then? Just reply to this email.</div>
<div><br></div>
<div>&mdash; Team Gradient Learnings</div>`,
  },
  {
    type: COURSE_EMAIL_TYPES.BROCHURE_DOWNLOAD,
    subject: "Your Data Analytics curriculum is inside",
    body: `<div>Hi {{name}},</div>
<div><br></div>
<div>Thanks for your interest in the <strong>Data Analytics Program</strong>. Here is the detailed curriculum:</div>
<div><br></div>
<div><a href="REPLACE_WITH_BROCHURE_LINK" style="display:inline-block;background-color:#111827;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Download the curriculum</a></div>
<div><br></div>
<div><strong>Inside you'll find:</strong></div>
<div>&bull; Week-by-week module breakdown across the full program</div>
<div>&bull; The tools you'll work with &mdash; Excel, SQL, Python, Power BI and AI tooling</div>
<div>&bull; The capstone and portfolio projects you'll build</div>
<div>&bull; Cohort schedule, mentor support model and placement assistance details</div>
<div><br></div>
<div>Want to talk it through before deciding? Reply here and a counsellor will call you on {{phone}}.</div>
<div><br></div>
<div>&mdash; Team Gradient Learnings</div>`,
  },
];

async function main() {
  const existing = await Course.findOne({ where: { slug: SLUG } });

  if (existing) {
    console.log(
      `Course "${SLUG}" already exists (id ${existing.id}) — leaving it untouched.`,
    );
    return;
  }

  console.log(`Will create course "${SLUG}" with:`);
  console.log(`  price       ₹${PRICING.price} less ${PRICING.discountPercent}%`);
  console.log(`  cohort      ${PRICING.cohortDate}, ${PRICING.durationLabel}`);
  console.log(`  templates   ${TEMPLATES.map((t) => t.type).join(", ")} (disabled)`);

  if (!CONFIRM) {
    console.log("\nDRY RUN — nothing changed. Re-run with --confirm to apply.");
    return;
  }

  const course = await Course.create({
    slug: SLUG,
    name: "Data Analytics Program",
    pricing: PRICING,
    settings: SETTINGS,
    brochure: {},
    isPublished: true,
  });

  await CourseEmailTemplate.bulkCreate(
    TEMPLATES.map((template) => ({
      ...template,
      courseId: course.id,
      // Off by default: nobody should receive a seeded draft before the team
      // has read it in the admin panel.
      isEnabled: false,
    })),
  );

  console.log(`\n✅ Created course ${course.id} with ${TEMPLATES.length} draft templates.`);
  console.log(
    "Next: upload a brochure, then replace REPLACE_WITH_BROCHURE_LINK in the curriculum email with the link from the Brochure tab.",
  );
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
