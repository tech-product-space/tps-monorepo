"use strict";

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("EventGuests");

    if (!tableDescription.email) {
      await queryInterface.addColumn("EventGuests", "email", {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      });
    }

    if (!tableDescription.isAccountLinked) {
      await queryInterface.addColumn("EventGuests", "isAccountLinked", {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE "EventGuests" eg
      SET email = u.email
      FROM "users" u
      WHERE eg."userId" = u.id
        AND eg.email IS NULL
        AND eg."userId" IS NOT NULL;
    `);

    await queryInterface.sequelize.query(`
      UPDATE "EventGuests"
      SET "isAccountLinked" = true
      WHERE "userId" IS NOT NULL;
    `);

    await queryInterface.addIndex("EventGuests", ["email"], {
      name: "event_guests_email_idx",
    });

    // ──  Add composite index for duplicate-check queries ────────────────
    //    covers: findOne({ where: { eventId, email } })
    await queryInterface.addIndex("EventGuests", ["eventId", "email"], {
      name: "event_guests_event_id_email_idx",
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex(
      "EventGuests",
      "event_guests_event_id_email_idx",
    );
    await queryInterface.removeIndex(
      "EventGuests",
      "event_guests_email_idx",
    );

    // Remove columns
    await queryInterface.removeColumn("EventGuests", "isAccountLinked");
    await queryInterface.removeColumn("EventGuests", "email");
  },
};