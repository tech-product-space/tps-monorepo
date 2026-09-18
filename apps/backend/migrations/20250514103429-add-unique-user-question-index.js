'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addIndex('user_quiz_entries', ['user_id', 'question_id'], {
      name: 'user_question_unique_index',
      unique: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('user_quiz_entries', 'user_question_unique_index');
  }
};
