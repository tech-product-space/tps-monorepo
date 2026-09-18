module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('user_fitment_scores', 'jobDescription', {
      type: Sequelize.TEXT,
    });
    await queryInterface.changeColumn('user_fitment_scores', 'role_fitment_score', {
      type: Sequelize.TEXT,
    });
    // Repeat for other long fields if necessary
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('user_fitment_scores', 'jobDescription', {
      type: Sequelize.STRING,
    });
    await queryInterface.changeColumn('user_fitment_scores', 'role_fitment_score', {
      type: Sequelize.STRING,
    });
    // Repeat for others
  },
};
