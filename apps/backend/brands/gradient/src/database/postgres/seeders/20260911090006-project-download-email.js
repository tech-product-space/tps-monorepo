"use strict";

import { ulid } from "ulid";

import { PROJECT_EMAIL_TYPE } from "../../../config/constants/project.js";

/**
 * The global download email, so a fresh environment has a working default
 * rather than a gate that silently mails nothing.
 *
 * **Idempotent.** `config.js` sets no `seederStorage`, so sequelize-cli keeps no
 * record of what has run and `pg:seed:all` re-executes this every time. The
 * partial unique index would reject a second global row anyway — but failing
 * the whole seed run on the second invocation is not a useful way to find that
 * out.
 *
 * The copy here is a starting point, not the final word: it is editable at
 * /projects/email-templates, and the admin's version is what goes out.
 */
const BODY = `
<p>Hi {{name}},</p>
<p>Here's the starter code for <strong>{{projectTitle}}</strong>. The link below
has everything you need to get going.</p>
<p><a href="{{downloadUrl}}">Download the project</a></p>
<p>The full step-by-step guide lives here — it walks through the build from
setup to a working app:</p>
<p><a href="{{projectUrl}}">Open the guide</a></p>
<p>Happy building,<br />The Gradient team</p>
`.trim();

export default {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    const [existing] = await sequelize.query(
      `SELECT id FROM "ProjectEmailTemplates"
        WHERE "projectId" IS NULL AND type = :type
        LIMIT 1`,
      { replacements: { type: PROJECT_EMAIL_TYPE.DOWNLOAD_DELIVERY } },
    );

    if (existing[0]?.id) return;

    await queryInterface.bulkInsert("ProjectEmailTemplates", [
      {
        id: ulid(),
        projectId: null,
        type: PROJECT_EMAIL_TYPE.DOWNLOAD_DELIVERY,
        subject: "Your {{projectTitle}} project files",
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
      type: PROJECT_EMAIL_TYPE.DOWNLOAD_DELIVERY,
    });
  },
};
