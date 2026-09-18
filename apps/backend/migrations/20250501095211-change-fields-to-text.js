'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('user_fitment_scores', 'strength_1', { type: Sequelize.TEXT });
    await queryInterface.changeColumn('user_fitment_scores', 'strength_2', { type: Sequelize.TEXT });
    await queryInterface.changeColumn('user_fitment_scores', 'strength_3', { type: Sequelize.TEXT });

    await queryInterface.changeColumn('user_fitment_scores', 'weakness_1', { type: Sequelize.TEXT });
    await queryInterface.changeColumn('user_fitment_scores', 'weakness_2', { type: Sequelize.TEXT });
    await queryInterface.changeColumn('user_fitment_scores', 'weakness_3', { type: Sequelize.TEXT });

    await queryInterface.changeColumn('user_fitment_scores', 'resume_improvement_1', { type: Sequelize.TEXT });
    await queryInterface.changeColumn('user_fitment_scores', 'resume_improvement_2', { type: Sequelize.TEXT });
    await queryInterface.changeColumn('user_fitment_scores', 'resume_improvement_3', { type: Sequelize.TEXT });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('user_fitment_scores', 'strength_1', { type: Sequelize.STRING });
    await queryInterface.changeColumn('user_fitment_scores', 'strength_2', { type: Sequelize.STRING });
    await queryInterface.changeColumn('user_fitment_scores', 'strength_3', { type: Sequelize.STRING });

    await queryInterface.changeColumn('user_fitment_scores', 'weakness_1', { type: Sequelize.STRING });
    await queryInterface.changeColumn('user_fitment_scores', 'weakness_2', { type: Sequelize.STRING });
    await queryInterface.changeColumn('user_fitment_scores', 'weakness_3', { type: Sequelize.STRING });

    await queryInterface.changeColumn('user_fitment_scores', 'resume_improvement_1', { type: Sequelize.STRING });
    await queryInterface.changeColumn('user_fitment_scores', 'resume_improvement_2', { type: Sequelize.STRING });
    await queryInterface.changeColumn('user_fitment_scores', 'resume_improvement_3', { type: Sequelize.STRING });
  }
};
