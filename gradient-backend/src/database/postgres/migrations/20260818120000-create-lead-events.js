"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("lead_events", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      /** Lowercased and trimmed by the recorder. Every index below leads with it. */
      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      eventType: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      /**
       * When it happened, not when the row was written. A backfill sets this
       * from the source row, so the two can be years apart.
       */
      occurredAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      sourceType: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      /** Primary key in the `sourceType` table. Deliberately not a foreign key:
       *  the stream has to outlive the rows it describes. */
      sourceId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      enrollmentId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      nodeRunId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      dedupeKey: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      // No updatedAt — the table is append-only.
    });

    /**
     * The timeline query: everything for one person, newest first.
     */
    await queryInterface.addIndex("lead_events", ["email", "occurredAt"], {
      name: "lead_events_email_occurred_at",
    });

    /**
     * The workflow condition query (§7.2): "did this person do X since T".
     * `email` then `eventType` then `occurredAt` is the exact column order that
     * query filters in, so it is answered by this index alone.
     */
    await queryInterface.addIndex(
      "lead_events",
      ["email", "eventType", "occurredAt"],
      { name: "lead_events_email_type_occurred_at" },
    );

    /**
     * Idempotency, and the reason the recorder can be called twice for the same
     * fact. Partial, because most events have no natural key — two form
     * submissions from the same address on the same day are two real events,
     * and a non-partial unique index would silently swallow the second.
     */
    await queryInterface.addIndex("lead_events", ["dedupeKey"], {
      name: "lead_events_dedupe_key_unique",
      unique: true,
      where: { dedupeKey: { [Sequelize.Op.ne]: null } },
    });

    /**
     * Metadata containment, for conditions that narrow to a specific event or
     * course (`metadata @> '{"eventId":"..."}'`). GIN with `jsonb_path_ops` is
     * roughly half the size of the default and supports `@>`, which is the only
     * operator this table is queried with.
     */
    await queryInterface.sequelize.query(
      `CREATE INDEX lead_events_metadata_gin
         ON lead_events USING GIN (metadata jsonb_path_ops)`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("lead_events");
  },
};
