'use strict';

/**
 * Migration: Restructure leads into profile-centric model.
 *
 * Creates lead_profiles table, adds profile_id to leads & activities,
 * creates lead_notes table, migrates conversations, drops old columns.
 *
 * IMPORTANT: Back up your database before running this migration.
 * This is a one-way migration (down() is a no-op).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // ─── 1. Create lead_profiles table ───
      await queryInterface.createTable('lead_profiles', {
        id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        email: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        phone: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        country_code: {
          type: Sequelize.STRING(10),
          defaultValue: '+91',
        },
        intent: {
          type: Sequelize.STRING(10),
          defaultValue: 'Low',
        },
        name_history: {
          type: Sequelize.JSONB,
          defaultValue: [],
        },
        email_history: {
          type: Sequelize.JSONB,
          defaultValue: [],
        },
        interested_products: {
          type: Sequelize.ARRAY(Sequelize.STRING),
          defaultValue: [],
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
        },
      }, { transaction });

      await queryInterface.addIndex('lead_profiles', ['phone'], {
        unique: true,
        name: 'lead_profiles_phone_unique',
        transaction,
      });
      await queryInterface.addIndex('lead_profiles', ['email'], {
        name: 'lead_profiles_email',
        transaction,
      });

      // ─── 2. Populate lead_profiles from existing leads ───
      // Group by normalized phone (digits only), including soft-deleted leads
      await queryInterface.sequelize.query(`
        WITH norm AS (
          SELECT id, name, email, phone, country_code, intent, product_id,
                 created_at,
                 REGEXP_REPLACE(phone, '[^0-9]', '', 'g') AS norm_phone
          FROM leads
          WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') != ''
        )
        INSERT INTO lead_profiles (id, name, email, phone, country_code, intent, name_history, email_history, interested_products, created_at, updated_at)
        SELECT
          gen_random_uuid() AS id,
          (ARRAY_AGG(n.name ORDER BY n.created_at DESC))[1] AS name,
          (ARRAY_AGG(n.email ORDER BY CASE WHEN n.email IS NOT NULL THEN 0 ELSE 1 END, n.created_at DESC))[1] AS email,
          n.norm_phone AS phone,
          (ARRAY_AGG(n.country_code ORDER BY n.created_at DESC))[1] AS country_code,
          CASE WHEN BOOL_OR(n.intent = 'High') THEN 'High' ELSE 'Low' END AS intent,
          COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT n.name), NULL)), '[]'::jsonb) AS name_history,
          COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT n.email), NULL)), '[]'::jsonb) AS email_history,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT n.product_id), NULL) AS interested_products,
          MIN(n.created_at) AS created_at,
          NOW() AS updated_at
        FROM norm n
        GROUP BY n.norm_phone
      `, { transaction });

      // Handle leads with empty/null phone: create one profile per lead
      await queryInterface.sequelize.query(`
        INSERT INTO lead_profiles (id, name, email, phone, country_code, intent, name_history, email_history, interested_products, created_at, updated_at)
        SELECT
          gen_random_uuid(),
          COALESCE(l.name, 'Anonymous'),
          l.email,
          'orphan_' || l.id::text,
          COALESCE(l.country_code, '+91'),
          COALESCE(l.intent, 'Low'),
          CASE WHEN l.name IS NOT NULL THEN jsonb_build_array(l.name) ELSE '[]'::jsonb END,
          CASE WHEN l.email IS NOT NULL THEN jsonb_build_array(l.email) ELSE '[]'::jsonb END,
          ARRAY[l.product_id],
          l.created_at,
          NOW()
        FROM leads l
        WHERE REGEXP_REPLACE(COALESCE(l.phone, ''), '[^0-9]', '', 'g') = ''
      `, { transaction });

      // ─── 3. Add profile_id to leads (nullable initially) ───
      await queryInterface.addColumn('leads', 'profile_id', {
        type: Sequelize.UUID,
        allowNull: true,
      }, { transaction });

      // ─── 4. Populate profile_id in leads via phone match ───
      // Match leads with valid phone
      await queryInterface.sequelize.query(`
        UPDATE leads
        SET profile_id = lp.id
        FROM lead_profiles lp
        WHERE REGEXP_REPLACE(leads.phone, '[^0-9]', '', 'g') = lp.phone
          AND REGEXP_REPLACE(leads.phone, '[^0-9]', '', 'g') != ''
      `, { transaction });

      // Match orphan leads (empty phone) to their generated profiles
      await queryInterface.sequelize.query(`
        UPDATE leads
        SET profile_id = lp.id
        FROM lead_profiles lp
        WHERE lp.phone = 'orphan_' || leads.id::text
          AND REGEXP_REPLACE(COALESCE(leads.phone, ''), '[^0-9]', '', 'g') = ''
      `, { transaction });

      // ─── 5. Make profile_id NOT NULL + FK + index ───
      await queryInterface.changeColumn('leads', 'profile_id', {
        type: Sequelize.UUID,
        allowNull: false,
      }, { transaction });

      await queryInterface.addConstraint('leads', {
        fields: ['profile_id'],
        type: 'foreign key',
        name: 'fk_leads_profile_id',
        references: { table: 'lead_profiles', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        transaction,
      });

      await queryInterface.addIndex('leads', ['profile_id'], {
        name: 'leads_profile_id',
        transaction,
      });

      // ─── 6. Deduplicate active leads with same (profile_id, product_id) ───
      // Keep the latest, soft-delete older ones
      await queryInterface.sequelize.query(`
        UPDATE leads
        SET is_deleted = true
        WHERE id IN (
          SELECT id FROM (
            SELECT id,
              ROW_NUMBER() OVER (PARTITION BY profile_id, product_id ORDER BY created_at DESC) AS rn
            FROM leads
            WHERE is_deleted = false
          ) sub
          WHERE sub.rn > 1
        )
      `, { transaction });

      // ─── 7. Add profile_id to activities ───
      await queryInterface.addColumn('activities', 'profile_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'lead_profiles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      }, { transaction });

      // ─── 8. Populate profile_id in activities via leads ───
      await queryInterface.sequelize.query(`
        UPDATE activities
        SET profile_id = leads.profile_id
        FROM leads
        WHERE activities.lead_id = leads.id
      `, { transaction });

      await queryInterface.addIndex('activities', ['profile_id', 'created_at'], {
        name: 'activities_profile_id_created_at',
        transaction,
      });

      // ─── 9. Create lead_notes table ───
      await queryInterface.createTable('lead_notes', {
        id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
        },
        lead_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'leads', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        profile_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'lead_profiles', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        actor_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        type: {
          type: Sequelize.STRING(30),
          allowNull: false,
        },
        content: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        metadata: {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
        },
      }, { transaction });

      await queryInterface.addIndex('lead_notes', ['lead_id', 'created_at'], {
        name: 'lead_notes_lead_id_created_at',
        transaction,
      });
      await queryInterface.addIndex('lead_notes', ['profile_id', 'created_at'], {
        name: 'lead_notes_profile_id_created_at',
        transaction,
      });

      // ─── 10. Migrate conversation JSONB → lead_notes ───
      await queryInterface.sequelize.query(`
        INSERT INTO lead_notes (id, lead_id, profile_id, actor_id, type, content, metadata, created_at, updated_at)
        SELECT
          gen_random_uuid(),
          l.id,
          l.profile_id,
          NULL,
          'Conversation',
          msg->>'message',
          jsonb_build_object(
            'sender', msg->>'sender',
            'original_id', msg->>'id',
            'edited_at', msg->>'edited_at'
          ),
          COALESCE((msg->>'timestamp')::timestamp, l.created_at),
          NOW()
        FROM leads l,
          jsonb_array_elements(l.conversation) AS msg
        WHERE l.conversation IS NOT NULL
          AND jsonb_array_length(l.conversation) > 0
          AND msg->>'message' IS NOT NULL
      `, { transaction });

      // ─── 11. Rename lead_date → lead_update_date ───
      await queryInterface.renameColumn('leads', 'lead_date', 'lead_update_date', { transaction });

      // ─── 12. Drop old columns from leads ───
      const columnsToDrop = [
        'name', 'phone', 'email', 'city', 'state', 'country_code',
        'last_re_entry', 'is_re_entry_priority', 'product_history',
        'intent', 'conversation'
      ];
      for (const col of columnsToDrop) {
        await queryInterface.removeColumn('leads', col, { transaction });
      }

      // ─── 13. Add partial unique index (profile_id, product_id) WHERE is_deleted = false ───
      await queryInterface.addIndex('leads', ['profile_id', 'product_id'], {
        unique: true,
        name: 'leads_profile_product_active_unique',
        where: { is_deleted: false },
        transaction,
      });

      await transaction.commit();
      console.log('Migration completed: leads restructured to profile-centric model.');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // This is a one-way migration. Back up your database before running.
    console.warn('This migration is not reversible. Restore from backup if needed.');
  },
};
