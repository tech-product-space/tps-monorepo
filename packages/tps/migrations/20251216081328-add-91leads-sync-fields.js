"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // ===============================
    // PLATFORM LEADS
    // ===============================
    await queryInterface.addColumn("platform_leads", "leads91Synced", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("platform_leads", "leads91SyncedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // ===============================
    // RESOURCE LEADS
    // ===============================
    await queryInterface.addColumn("ResourceLeads", "leads91Synced", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("ResourceLeads", "leads91SyncedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // ===============================
    // EVENT GUESTS
    // ===============================
    await queryInterface.addColumn("EventGuests", "leads91Synced", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("EventGuests", "leads91SyncedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // ===============================
    // PLATFORM LEADS
    // ===============================
    await queryInterface.removeColumn("platform_leads", "leads91Synced");
    await queryInterface.removeColumn("platform_leads", "leads91SyncedAt");

    // ===============================
    // RESOURCE LEADS
    // ===============================
    await queryInterface.removeColumn("ResourceLeads", "leads91Synced");
    await queryInterface.removeColumn("ResourceLeads", "leads91SyncedAt");

    // ===============================
    // EVENT GUESTS
    // ===============================
    await queryInterface.removeColumn("EventGuests", "leads91Synced");
    await queryInterface.removeColumn("EventGuests", "leads91SyncedAt");
  },
};
