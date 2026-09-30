"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // ─── 1. Create table ─────────────────────────────────────────────────────
    await queryInterface.createTable("lead_history", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      lead_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "leads", key: "id" },
        onDelete: "CASCADE",
      },
      profile_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      product_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      subsource_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      utm_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      utm_source: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      utm_medium: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      utm_campaign: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      utm_content: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      extra_fields: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      additional_data: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      source_created_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      // ── history-specific ──────────────────────────────────────────────────
      changed_by: {
        // actor_id who triggered this snapshot — null means system/webhook
        type: Sequelize.UUID,
        allowNull: true,
      },
      change_type: {
        // created | reentry_same_product | reentry_new_product
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      source: {
        // Manual | Webhook | Import …
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      recorded_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // ─── 2. Indexes ──────────────────────────────────────────────────────────
    await queryInterface.addIndex("lead_history", ["lead_id"], {
      name: "idx_lead_history_lead_id",
    });

    await queryInterface.addIndex("lead_history", ["profile_id"], {
      name: "idx_lead_history_profile_id",
    });

    await queryInterface.addIndex("lead_history", ["recorded_at"], {
      name: "idx_lead_history_recorded_at",
    });

    // GIN index — powers extra_fields containment search across history
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_lead_history_extra_fields_gin
      ON lead_history
      USING GIN (extra_fields);
    `);

    // ─── 3. Backfill: baseline from current leads ────────────────────────────
    //
    // Every live lead gets one history row representing its current state.
    // recorded_at = source_created_at or created_at so it sorts correctly
    // in the timeline.
    //
    await queryInterface.sequelize.query(`
      INSERT INTO lead_history (
        id,
        lead_id,
        profile_id,
        product_id,
        subsource_id,
        utm_id,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        extra_fields,
        additional_data,
        source_created_at,
        changed_by,
        change_type,
        source,
        recorded_at
      )
      SELECT
        gen_random_uuid(),
        l.id,
        l.profile_id,
        l.product_id,
        l.subsource_id,
        l.utm_id,
        l.utm_source,
        l.utm_medium,
        l.utm_campaign,
        l.utm_content,
        l.extra_fields,
        l.additional_data,
        l.source_created_at,
        NULL,
        'created',
        NULL,
        COALESCE(l.source_created_at, l.created_at)
      FROM leads l
      WHERE l.is_deleted = false
    `);

    // ─── 4. Backfill: same-product re-entries from activities ─────────────────
    //
    // Uses ILIKE for case-insensitive title match, and pulls profile_id from
    // the leads table (safer than a.profile_id which may not exist on activities).
    //
    await queryInterface.sequelize.query(`
      INSERT INTO lead_history (
        id,
        lead_id,
        profile_id,
        product_id,
        subsource_id,
        utm_id,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        extra_fields,
        additional_data,
        source_created_at,
        changed_by,
        change_type,
        source,
        recorded_at
      )
      SELECT
        gen_random_uuid(),
        a.lead_id,
        l.profile_id,
        l.product_id,
        COALESCE(a.metadata -> 'old' ->> 'subsource_id', l.subsource_id),
        COALESCE(a.metadata -> 'old' ->> 'utm_id',       l.utm_id),
        COALESCE(a.metadata -> 'old' ->> 'utm_source',   l.utm_source),
        COALESCE(a.metadata -> 'old' ->> 'utm_medium',   l.utm_medium),
        COALESCE(a.metadata -> 'old' ->> 'utm_campaign', l.utm_campaign),
        COALESCE(a.metadata -> 'old' ->> 'utm_content',  l.utm_content),
        CASE
          WHEN a.metadata -> 'old' ? 'extra_fields'
          THEN (a.metadata -> 'old' -> 'extra_fields')::jsonb
          ELSE l.extra_fields
        END,
        CASE
          WHEN a.metadata -> 'old' ? 'additional_data'
          THEN (a.metadata -> 'old' -> 'additional_data')::jsonb
          ELSE l.additional_data
        END,
        l.source_created_at,
        a.actor_id,
        'reentry_same_product',
        a.metadata ->> 'source',
        a.created_at
      FROM activities a
      JOIN leads l ON l.id = a.lead_id
      WHERE a.title ILIKE '%re-entered%same product%'
        AND a.lead_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM lead_history lh
          WHERE lh.lead_id     = a.lead_id
            AND lh.recorded_at = a.created_at
            AND lh.change_type = 'reentry_same_product'
        )
      ORDER BY a.created_at ASC
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("lead_history");
  },
};