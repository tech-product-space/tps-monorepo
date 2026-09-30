'use strict';

module.exports = (sequelize, DataTypes) => {
  const UserQuizEntry = sequelize.define('UserQuizEntry', {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,  // Added `allowNull: false` to match the migration
    },
    question_id: {
      type: DataTypes.INTEGER,
      allowNull: false,  // Added `allowNull: false` to match the migration
    },
    status: {
      type: DataTypes.ENUM('unanswered', 'answered'),
      defaultValue: 'unanswered',
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,  // Added `allowNull: false` to match the migration
    },
    sub_category: {
      type: DataTypes.STRING,
      allowNull: true,  // Subcategory is nullable in migration
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,  // Added `allowNull: false` to match the migration
    },
    correct_answer: {
      type: DataTypes.STRING,
      allowNull: false,  // Added `allowNull: false` to match the migration
    },
    selected_answer: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_correct: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,  // Added `allowNull: false` to match the migration
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    is_completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: true,
    },
  }, {
    tableName: 'user_quiz_entries',
    underscored: true,
  });

  UserQuizEntry.associate = function (models) {
    UserQuizEntry.belongsTo(models.QuizQuestion, {
      foreignKey: 'question_id',
      as: 'quizQuestion',
    });
  };


  return UserQuizEntry;
};
