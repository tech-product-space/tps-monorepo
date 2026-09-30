import { DataTypes } from "sequelize";
import { ulid } from "ulid";

import { PROJECT_EMAIL_TYPE_LIST } from "../../../config/constants/project.js";

/**
 * The download email: **one global template, overridable per project.**
 *
 * `projectId IS NULL` means *this is the global default*. One table rather than
 * a `project_settings` singleton for the global plus a per-project table,
 * because the two have the same three fields, the same validation and the same
 * editor component — splitting them would mean two shapes, two endpoints and
 * two React forms for one concept.
 *
 * The cost is that `NULL` carries meaning. That cost is paid down in two
 * places, and nowhere else may reimplement either:
 *
 * - **`resolveProjectEmail()`** in `services/project/projectEmail.service.js`
 *   is the only reader. Override, else global, else send nothing.
 * - **Two partial unique indexes** in the migration enforce one global per type
 *   and one override per (project, type). A single index cannot express both.
 *
 * Rows rather than a JSONB blob on `Projects`, for the reason
 * `FreeCourseEmailTemplate` gives: a submission approved/rejected email is the
 * obvious second type, and rows make that a constant plus a card in admin with
 * no migration.
 */
export default (sequelize) => {
  const ProjectEmailTemplate = sequelize.define(
    "ProjectEmailTemplate",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      /** `NULL` is the global default. See the class note. */
      projectId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [PROJECT_EMAIL_TYPE_LIST],
        },
      },

      subject: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** Email HTML from the panel's EmailEditor — inline styles, for Outlook. */
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      /**
       * Lets an admin park a draft without it going out.
       *
       * On an **override** this is also the only way to switch the email off
       * for one project while the global stays on — which is what "override"
       * has to mean, or the admin's only recourse is saving an empty body and
       * sending a blank email.
       */
      isEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "ProjectEmailTemplates",
      timestamps: true,
    },
  );

  ProjectEmailTemplate.associate = (models) => {
    ProjectEmailTemplate.belongsTo(models.Project, {
      foreignKey: "projectId",
      as: "project",
    });
  };

  return ProjectEmailTemplate;
};
