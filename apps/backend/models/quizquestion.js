// models/quizquestion.js
"use strict";
module.exports = (sequelize, DataTypes) => {
  const QuizQuestion = sequelize.define("QuizQuestion", {
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    options: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      validate: {
        minOptions(value) {
          if (value.length < 2 || value.length > 5) {
            throw new Error("Options must be between 2 and 5.");
          }
        },
      },
    },
    answer: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    hasImage: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    subCategory: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  });

  QuizQuestion.associate = function (models) {
    QuizQuestion.hasMany(models.UserQuizEntry, {
      foreignKey: 'question_id',
      as: 'userEntries',
    });
  };

  return QuizQuestion;
};
