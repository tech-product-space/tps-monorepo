module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("blogs", "scheduledAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("blogs", "publishedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("blogs", "scheduledAt");
    await queryInterface.removeColumn("blogs", "publishedAt");
  },
};
