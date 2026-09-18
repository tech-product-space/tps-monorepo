"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("contacts", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      contactListId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "contact_lists", key: "id" },
        onDelete: "CASCADE",
      },

      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      /**
       * Stored lowercased and trimmed. The unique index below is what stops a
       * re-uploaded CSV doubling a list, and it can only do that if the same
       * address always normalises to the same string.
       */
      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      /**
       * Every column of the CSV that was not name, email or phone. Kept rather
       * than discarded because the interesting column in a real contact list is
       * usually the fourth one — company, cohort, ticket type — and throwing it
       * away means asking for the file again later.
       */
      additionalData: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
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

    // One row per person per list. Re-uploading the same CSV must not double
    // the list, and the upload endpoint relies on this rather than trusting its
    // own in-memory dedupe to survive two concurrent uploads.
    // It also serves every lookup by list on its own — `contactListId` is the
    // leading column — so there is deliberately no second index for those.
    await queryInterface.addIndex("contacts", ["contactListId", "email"], {
      unique: true,
      name: "contacts_list_email_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("contacts");
  },
};
