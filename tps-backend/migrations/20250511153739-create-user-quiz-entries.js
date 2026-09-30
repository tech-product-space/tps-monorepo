'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('user_quiz_entries', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      question_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('unanswered', 'answered'),
        defaultValue: 'unanswered'
      },
      category: {
        type: Sequelize.STRING,
        allowNull: false
      },
      sub_category: {
        type: Sequelize.STRING,
        allowNull: true
      },
      question: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      correct_answer: {
        type: Sequelize.STRING,
        allowNull: false
      },
      selected_answer: {
        type: Sequelize.STRING,
        allowNull: true
      },
      is_correct: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('user_quiz_entries');
  }
};
