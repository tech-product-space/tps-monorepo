"use strict";

/**
 * Which gate a lead came through, and when.
 *
 * `source` already exists but answers a different question — how we *got* the
 * details (typed, or carried from another project), not what they bought. With
 * the guide behind the same form as the download, a row with neither timestamp
 * would be unreadable in the panel: "is this a download, or somebody who only
 * read the guide?" is the number that says whether gating the guide earns
 * anything.
 *
 * Both nullable: a lead has passed one door, the other, or both.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("ProjectLeads", "guideUnlockedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("ProjectLeads", "downloadedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Every row that exists today was written by the download gate, which was
    // the only gate there was. Backfilled from `createdAt` so the panel does
    // not read them as guide unlocks.
    await queryInterface.sequelize.query(
      `UPDATE "ProjectLeads" SET "downloadedAt" = "createdAt" WHERE "downloadedAt" IS NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("ProjectLeads", "guideUnlockedAt");
    await queryInterface.removeColumn("ProjectLeads", "downloadedAt");
  },
};
