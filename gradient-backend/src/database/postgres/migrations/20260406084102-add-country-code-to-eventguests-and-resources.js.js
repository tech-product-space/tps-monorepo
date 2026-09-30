"use strict";

export default {
  async up(queryInterface, Sequelize) {
    // EventGuests table
    await queryInterface.addColumn("EventGuests", "countryCode", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // ResourceLeads table
    await queryInterface.addColumn("ResourceLeads", "countryCode", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("EventGuests", "countryCode");
    await queryInterface.removeColumn("ResourceLeads", "countryCode");
  },
};
