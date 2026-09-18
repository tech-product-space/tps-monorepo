"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("campaigns", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      subject: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      senderEmail: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      senderName: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: "Gradient Learnings",
      },

      /**
       * `{ include: [{ type, filters }], exclude: [...] }` — a saved query, not
       * a frozen list. Resolved to people at send time, so a campaign built on
       * Monday for Friday picks up Thursday's leads.
       */
      recipientFilters: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: { include: [], exclude: [] },
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "draft",
      },

      scheduledAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      sentAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      // Owned by the send job. Present from the start for the same reason
      // EventReminder has them: a campaign where every send failed is otherwise
      // indistinguishable from one that went out cleanly.
      totalRecipients: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      totalSent: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      totalFailed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      createdBy: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      updatedBy: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // The list screen filters by status and orders by recency.
    await queryInterface.addIndex("campaigns", ["status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("campaigns");
  },
};
