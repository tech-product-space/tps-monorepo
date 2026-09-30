"use strict";

/**
 * Facebook Lead Ads leads.
 *
 * A separate table from `leads` by decision, not by accident — the two
 * pipelines stay independent, with their own screens, volumes and retention.
 * See `../FACEBOOK_LEADS_PLAN.md` §2 for what that buys and what it obliges.
 *
 * One row per Facebook lead. This is both the lead and the ledger: there is no
 * second table holding raw payloads.
 *
 * Two dedupe mechanisms live here and they are not the same thing:
 *
 *   • `metaLeadId` unique   — stops the *same Facebook lead* being imported
 *                             twice. Infrastructure. A re-import is not an
 *                             event and creates no row.
 *   • `status: duplicate`   — records that the *same person* filled a second
 *                             form. Information. The row is kept, because a
 *                             repeat touch is worth seeing.
 *
 * Conflating them is why the CRM this was ported from counts real leads as
 * duplicates.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_leads", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      /**
       * Facebook's lead id — globally unique across pages and forms, which is
       * why the unique index below is on this column alone.
       *
       * This is the idempotency guard for the whole feature: it is what makes
       * the poll's deliberate 10-minute overlap free, and what makes a
       * crashed backfill safe to re-run.
       */
      metaLeadId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      accountId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "meta_accounts", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      /**
       * Plain strings, not foreign keys. A lead must outlive the form it came
       * through — forms get deleted in Meta and the lead is still a person.
       */
      formId: { type: Sequelize.STRING, allowNull: false },
      pageId: { type: Sequelize.STRING, allowNull: false },
      /** Snapshot at import — the form can be renamed later. */
      formName: { type: Sequelize.STRING, allowNull: true },

      /**
       * Nullable, with no placeholder. A form that did not ask for a name
       * should read as unknown rather than as "Facebook Lead".
       */
      name: { type: Sequelize.STRING, allowNull: true },

      /**
       * Lowercased and trimmed on the way in. No `isEmail` validator anywhere
       * in this table — a Facebook payload must never be able to reject its
       * own row. A malformed address is left null here and kept in
       * `rawPayload`, where the detail screen still shows it.
       */
      email: { type: Sequelize.STRING, allowNull: true },

      phone: { type: Sequelize.STRING, allowNull: true },
      countryCode: { type: Sequelize.STRING, allowNull: true },

      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "new",
      },

      /**
       * Resolved from the form mapping at import time and frozen on the row.
       *
       * Deliberately not joined from `meta_forms` at read time: remapping a
       * form next month must not silently rewrite the attribution of leads
       * that already arrived under the old rule. The form row holds the
       * current rule; this holds the rule that applied to this lead.
       */
      source: { type: Sequelize.STRING, allowNull: true },
      subSource: { type: Sequelize.STRING, allowNull: true },
      sourceDisplayName: { type: Sequelize.STRING, allowNull: true },
      subSourceDisplayName: { type: Sequelize.STRING, allowNull: true },
      courseId: { type: Sequelize.STRING, allowNull: true },

      // ── Ad taxonomy. Real columns, not JSONB: these are the filters the
      //    Meta Leads screen is built on, and a JSONB path lookup per row is
      //    the difference between a fast list and a sequential scan.
      campaignId: { type: Sequelize.STRING, allowNull: true },
      campaignName: { type: Sequelize.STRING, allowNull: true },
      adsetId: { type: Sequelize.STRING, allowNull: true },
      adsetName: { type: Sequelize.STRING, allowNull: true },
      adId: { type: Sequelize.STRING, allowNull: true },
      adName: { type: Sequelize.STRING, allowNull: true },

      /** Every question that was not name, email or phone. */
      fields: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /**
       * Exactly what Graph returned. Non-negotiable: a mapping bug is only
       * replayable if the original survived, and Facebook will not hand the
       * history back a second time.
       */
      rawPayload: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /**
       * Facebook's `created_time`, and what the list sorts by.
       *
       * `createdAt` is when *we* imported it, which for a backfill is today.
       * Sorting on that would dump five years of history into one afternoon.
       */
      sourceCreatedAt: { type: Sequelize.DATE, allowNull: false },

      /** `poll` | `backfill`. */
      importedVia: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "poll",
      },

      /** `no_contact` | `invalid_payload`, set alongside status `skipped`. */
      skipReason: { type: Sequelize.STRING(30), allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("meta_leads", ["metaLeadId"], {
      name: "uq_meta_leads_meta_lead_id",
      unique: true,
    });

    // The default list view: one account, newest first.
    await queryInterface.addIndex(
      "meta_leads",
      [{ name: "accountId" }, { name: "sourceCreatedAt", order: "DESC" }],
      { name: "idx_meta_leads_account_received" },
    );

    // The screen's filter set.
    await queryInterface.addIndex("meta_leads", ["formId"], {
      name: "idx_meta_leads_form",
    });
    await queryInterface.addIndex("meta_leads", ["campaignId"], {
      name: "idx_meta_leads_campaign",
    });
    await queryInterface.addIndex("meta_leads", ["adsetId"], {
      name: "idx_meta_leads_adset",
    });
    await queryInterface.addIndex("meta_leads", ["adId"], {
      name: "idx_meta_leads_ad",
    });
    await queryInterface.addIndex("meta_leads", ["status"], {
      name: "idx_meta_leads_status",
    });

    // Search, the duplicate check on import, and the campaign resolver.
    await queryInterface.addIndex("meta_leads", ["email"], {
      name: "idx_meta_leads_email",
    });
    await queryInterface.addIndex("meta_leads", ["phone"], {
      name: "idx_meta_leads_phone",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_leads");
  },
};
