import { DataTypes } from "sequelize";
import { ulid } from "ulid";

/**
 * One step of a project's guide — the left sidebar on `/projects/<…>/<slug>`.
 *
 * This is the free-course curriculum with one level removed: `FreeCourseLesson`
 * is the model it copies, and the admin editor copies `LessonContentPage`.
 *
 * **One level, not two.** Free courses are module → lesson; a guide is a flat
 * list. The reference design has exactly one level of nesting, and five to
 * eight steps is not a curriculum that needs chaptering — a module layer here
 * would be a table every project puts exactly one row in, bought with a join, a
 * form and a reorder screen. If sections are ever genuinely needed, that is a
 * `groupTitle` column, not a table.
 *
 * **`content` is TiptapEditor ProseMirror JSON**, the same shape as
 * `FreeCourseLesson.content` — not HTML. That is what buys the code blocks,
 * which are the whole point of a coding guide and are already built
 * (`TiptapEditor/CodeBlockNode.tsx` plus the Lezer highlighter, mirrored in
 * `gradient-next-ui/lib/code/`). A plain-HTML editor here would leave a Python
 * project's guide unable to show Python.
 */
export default (sequelize) => {
  const ProjectStep = sequelize.define(
    "ProjectStep",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      projectId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /**
       * Unique **per project**, not globally — `/projects/<…>/<slug>/<stepSlug>`
       * is already scoped by the project, and a global unique index would mean
       * the second project to want a step called "setup" could not have one.
       */
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** Sidebar order. Reordered as a whole array, like modules and lessons. */
      order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      /** ProseMirror JSON. See the class note above. */
      content: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /** A step can be drafted while the project around it is live. */
      isPublished: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      seo: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: "ProjectSteps",
      timestamps: true,
      hooks: {
        beforeValidate: (step) => {
          if (step.title && !step.slug) {
            step.slug = step.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
          }
        },
      },
    },
  );

  ProjectStep.associate = (models) => {
    ProjectStep.belongsTo(models.Project, {
      foreignKey: "projectId",
      as: "project",
    });

    ProjectStep.hasMany(models.ProjectStepProgress, {
      foreignKey: "projectStepId",
      as: "progress",
    });
  };

  return ProjectStep;
};
