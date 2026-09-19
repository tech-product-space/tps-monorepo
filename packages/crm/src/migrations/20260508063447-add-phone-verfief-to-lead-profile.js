"use strict";

module.exports = {
  async up(queryInterface, DataTypes) {
    await queryInterface.addColumn("lead_profiles", "phone_verified", {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });

    await queryInterface.addColumn("lead_profiles", "phone_verified_source", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("lead_profiles", "phone_verified");
    await queryInterface.removeColumn("lead_profiles", "phone_verified_source");
  },
};