import { DataTypes } from "sequelize";
import { ulid } from "ulid";

import { emitProjectDownloaded } from "../../../services/leadEvent/emitters.js";
import { emitTriggerEvent } from "../../../services/workflow/triggers/emitTriggerEvent.js";
import { PROJECT_LEAD_SOURCE_LIST } from "../../../config/constants/project.js";

/**
 * Somebody who passed a project's download gate.
 *
 * **One row per (project, email), not one per submission.** `ResourceLeads`
 * inserts unconditionally, which is right for a one-shot download. A project's
 * gate is a client-side unlock, so it reappears for the same person on a new
 * device or with cleared storage — unconditional inserts would make "3,400
 * downloads" mostly a few hundred people typing their address again. A repeat
 * bumps `submissionCount` and `lastSubmittedAt` and returns 200 with the link;
 * it is not a 409.
 *
 * `email` is stored lowercased, the key every audience in this system uses.
 */
export default (sequelize) => {
  const ProjectLead = sequelize.define(
    "ProjectLead",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      projectId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /**
       * Set when the request happens to carry a website session cookie.
       *
       * Opportunistic, not required — the gate is a form, and asking for a
       * sign-up before a free download would cost more conversions than the
       * data is worth. It exists so the carry-forward lookup has something
       * stronger than an email to key on when one is available.
       */
      userId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      countryCode: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      source: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [PROJECT_LEAD_SOURCE_LIST],
        },
      },

      submissionCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      lastSubmittedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      /**
       * When a **human** last typed or confirmed these details.
       *
       * Freshness is measured on this, never on `createdAt`: a carried row is
       * created today out of details typed months ago, so measuring on
       * `createdAt` would reset the clock on every carry and the window would
       * never once expire. Anything writing a row here has to carry this
       * forward or set it — never default it.
       */
      detailsConfirmedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      /**
       * Which door this person came through, and when. Both nullable — a lead
       * may have unlocked the guide, downloaded, or done both.
       *
       * Distinct from `source`, which records how the details were obtained
       * (typed here, or carried from another project's gate).
       */
      guideUnlockedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      downloadedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      additionalData: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: "ProjectLeads",
      timestamps: true,
      /**
       * Lead-event emitter. Fires here rather than in the controller because
       * this row has more than one create path, and a trigger that silently
       * stops firing for one of them reads as "quiet", not as a bug. Deferred
       * to after-commit inside the emitter, so a rolled-back write records
       * nothing.
       *
       * **`afterCreate` only.** A repeat gate pass updates the existing row
       * rather than creating one, so nothing re-fires — which is what stops
       * somebody being re-enrolled in a workflow for opening a project on their
       * phone.
       */
      hooks: {
        afterCreate: (row, options) => {
          emitProjectDownloaded(row, options);
          emitTriggerEvent("projectLeads", row, options);
        },
        afterBulkCreate: (rows, options) => {
          for (const row of rows) {
            emitProjectDownloaded(row, options);
            emitTriggerEvent("projectLeads", row, options);
          }
        },
      },
    },
  );

  ProjectLead.associate = (models) => {
    ProjectLead.belongsTo(models.Project, {
      foreignKey: "projectId",
      as: "project",
    });
  };

  return ProjectLead;
};
