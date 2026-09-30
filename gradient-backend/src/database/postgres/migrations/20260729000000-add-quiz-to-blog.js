"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("blogs", "quiz", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: { enabled: false, questions: [] },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("blogs", "quiz");
  },
};
