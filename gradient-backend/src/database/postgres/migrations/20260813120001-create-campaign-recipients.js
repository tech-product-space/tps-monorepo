"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("campaign_recipients", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      campaignId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "campaigns", key: "id" },
        onDelete: "CASCADE",
      },

      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      /** Which resolver produced this person, and the id of the record it came
       *  from — the preview's source breakdown reads off these. */
      sourceType: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      sourceId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "pending",
      },

      sentAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      /**
       * The provider's message id — SES returns one per send and it is the only
       * key that ties a delivery, bounce or complaint notification back to this
       * row. Captured from phase 3 even though bounce handling is deferred:
       * storing it costs nothing, and without it a later switch-on would have
       * no way to backfill ids that no longer exist. See plan §9.1.
       */
      providerMessageId: {
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

    // The send loop claims batches with exactly this predicate, every pass.
    await queryInterface.addIndex("campaign_recipients", [
      "campaignId",
      "status",
    ]);

    // Excluding "everyone who already received campaign X" resolves by email
    // across campaigns.
    await queryInterface.addIndex("campaign_recipients", ["email"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("campaign_recipients");
  },
};
