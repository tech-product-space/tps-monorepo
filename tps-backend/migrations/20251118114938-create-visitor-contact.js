"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("VisitorContacts", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      visitorId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      email: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      source: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Foreign Key Constraint
    await queryInterface.addConstraint("VisitorContacts", {
      fields: ["visitorId"],
      type: "foreign key",
      name: "fk_visitorcontacts_visitorid",
      references: {
        table: "Visitors",
        field: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    // Index on visitorId for fast lookup
    await queryInterface.addIndex("VisitorContacts", ["visitorId"], {
      name: "idx_visitorcontacts_visitorid",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "VisitorContacts",
      "idx_visitorcontacts_visitorid"
    );

    await queryInterface.removeConstraint(
      "VisitorContacts",
      "fk_visitorcontacts_visitorid"
    );

    await queryInterface.dropTable("VisitorContacts");
  },
};
