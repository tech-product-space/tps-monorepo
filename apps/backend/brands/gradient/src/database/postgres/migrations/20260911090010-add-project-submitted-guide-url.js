"use strict";

/**
 * The submitter's own write-up, if they have one.
 *
 * **Not our guide.** The authored guide lives in `ProjectSteps`; this is a
 * link to whatever the contributor already wrote — a README, a blog post, a
 * YouTube walkthrough — and it exists so the admin authoring the steps has the
 * build described by the person who did it rather than reverse-engineered from
 * the repo. Named `submittedGuideUrl` and not `guideUrl` precisely so the two
 * can never be confused by anything reading the row.
 *
 * A column rather than a key in `submitter`: that blob is documented as "who
 * sent this in", and this is about the project, not the person.
 *
 * Nullable, and only ever set on a `community` row. Plenty of good projects
 * have no write-up at all — that is the normal case, not a missing field.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Projects", "submittedGuideUrl", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Projects", "submittedGuideUrl");
  },
};
