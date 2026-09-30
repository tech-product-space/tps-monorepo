"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("course_course_tags", {
      course_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "courses", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      course_tag_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "course_tags", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addConstraint("course_course_tags", {
      fields: ["course_id", "course_tag_id"],
      type: "primary key",
      name: "course_course_tags_pkey",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("course_course_tags");
  },
};
