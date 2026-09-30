"use strict";

export default {
  async up(queryInterface, Sequelize) {
    // Nullable rather than defaulted: the renderer already derives orientation
    // from the canvas when it is absent, and a NOT NULL DEFAULT 'landscape'
    // would silently stamp the wrong answer onto every portrait template.
    await queryInterface.addColumn("EventCertificateTemplates", "orientation", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Backfill from the shape of the background so existing templates carry the
    // same value the renderer would have inferred for them.
    await queryInterface.sequelize.query(`
      UPDATE "EventCertificateTemplates"
      SET "orientation" = CASE
        WHEN "canvasWidth" >= "canvasHeight" THEN 'landscape'
        ELSE 'portrait'
      END
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("EventCertificateTemplates", "orientation");
  },
};
