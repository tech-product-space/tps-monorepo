import { DataTypes } from "sequelize";
import { ulid } from "ulid";

/**
 * A step somebody has ticked off — the green checks and the "Resume" button in
 * the guide sidebar.
 *
 * **This is the one place the projects section needs an account.** The guide
 * itself is fully public: anyone reads every published step without signing in,
 * because the guide is the reason the download is worth wanting and hiding it
 * behind a sign-up puts the sales pitch behind the counter. Only the ticks are
 * gated.
 *
 * Two differences from `FreeCourseLessonProgress`, and both are corrections
 * rather than preferences:
 *
 * - **Unique on (userId, projectStepId).** The free-course table has no such
 *   constraint and can hold two rows for the same lesson.
 * - **`userId` comes from `req.user`, never from the request body.** The
 *   free-course completion route
 *   (`POST /free-courses/lesson/complete/:id`) reads `const { userId } =
 *   req.body` with no auth middleware mounted, so anybody can post progress for
 *   anybody. Both of this model's endpoints sit behind `authMiddleware`.
 */
export default (sequelize) => {
  const ProjectStepProgress = sequelize.define(
    "ProjectStepProgress",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      userId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      projectStepId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      completed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "ProjectStepProgress",
      timestamps: true,
    },
  );

  ProjectStepProgress.associate = (models) => {
    ProjectStepProgress.belongsTo(models.ProjectStep, {
      foreignKey: "projectStepId",
      as: "step",
    });

    ProjectStepProgress.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
    });
  };

  return ProjectStepProgress;
};
