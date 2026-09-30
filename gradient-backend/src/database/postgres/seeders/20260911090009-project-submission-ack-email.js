"use strict";

import { ulid } from "ulid";

import { PROJECT_EMAIL_TYPE } from "../../../config/constants/project.js";

/**
 * The acknowledgement a community submitter gets, so a fresh environment has
 * working copy rather than a form that receives a project and says nothing.
 *
 * **Idempotent**, for the same reason as the download seeder: `config.js` sets
 * no `seederStorage`, so `pg:seed:all` re-runs this every time and the partial
 * unique index would reject a second global row.
 *
 * The copy is careful about one thing above all: it acknowledges receipt and
 * promises a human will look. It must never read as though the project is
 * live, because it is not — it is unreviewed and unpublished, and a submitter
 * who tells their friends otherwise was misled by us.
 */
const BODY = `
<p>Hi {{name}},</p>
<p>Thanks for sending us <strong>{{projectTitle}}</strong> — we have it, and
someone on the team will read through it properly.</p>
<p>This is the link you shared:</p>
<p><a href="{{projectLink}}">{{projectLink}}</a></p>
<p>If we feature it, we will get in touch first to work through the write-up
with you. If it is not the right fit this time, that is no reflection on the
build — we are just fussy about what the hub covers.</p>
<p>Either way, thank you for contributing.</p>
<p>The Gradient team</p>
`.trim();

export default {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    const [existing] = await sequelize.query(
      `SELECT id FROM "ProjectEmailTemplates"
        WHERE "projectId" IS NULL AND type = :type
        LIMIT 1`,
      { replacements: { type: PROJECT_EMAIL_TYPE.SUBMISSION_ACK } },
    );

    if (existing[0]?.id) return;

    await queryInterface.bulkInsert("ProjectEmailTemplates", [
      {
        id: ulid(),
        projectId: null,
        type: PROJECT_EMAIL_TYPE.SUBMISSION_ACK,
        subject: "We have your project — {{projectTitle}}",
        body: BODY,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("ProjectEmailTemplates", {
      projectId: null,
      type: PROJECT_EMAIL_TYPE.SUBMISSION_ACK,
    });
  },
};
