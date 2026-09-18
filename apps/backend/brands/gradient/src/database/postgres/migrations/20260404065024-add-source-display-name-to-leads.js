"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("leads", "sourceDisplayName", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("leads", "subSource", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("leads", "subSourceDisplayName", {
      type: Sequelize.STRING,
      allowNull: true,
    });

  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex("leads", "idx_leads_source_subsource");

    await queryInterface.removeColumn("leads", "subSourceDisplayName");
    await queryInterface.removeColumn("leads", "subSource");
    await queryInterface.removeColumn("leads", "sourceDisplayName");
  },
};