"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("course_faqs", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true
      },

      course_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "courses",
          key: "id"
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE"
      },

      question: {
        type: Sequelize.STRING,
        allowNull: false
      },

      answer: {
        type: Sequelize.TEXT,
        allowNull: false
      },

      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP")
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP")
      }
    });

    // Indexes for performance
    await queryInterface.addIndex("course_faqs", ["course_id"]);
    await queryInterface.addIndex("course_faqs", ["course_id", "order"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("course_faqs");
  }
};
