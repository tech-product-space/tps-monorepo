"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.addColumn("leads", "source_created_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE leads
      SET source_created_at = COALESCE(
        TO_TIMESTAMP(NULLIF(extra_fields->>'timeStamp',''), 'DD Mon YYYY, HH12:MI PM'),
        TO_TIMESTAMP(NULLIF(extra_fields->>'timestamp',''), 'DD Mon YYYY, HH12:MI PM'),
        (extra_fields->>'created_time')::timestamp,
        created_at
      )
    `);

    await queryInterface.addIndex("leads", ["source_created_at"]);

  },

  async down(queryInterface, Sequelize) {

    await queryInterface.removeIndex("leads", ["source_created_at"]);
    await queryInterface.removeColumn("leads", "source_created_at");

  }
};