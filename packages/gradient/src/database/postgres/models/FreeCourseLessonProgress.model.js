import { DataTypes } from "sequelize";
import { ulid } from "ulid";

export default (sequelize) => {
    const FreeCourseLessonProgress = sequelize.define(
        "FreeCourseLessonProgress",
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

            freeCourseLessonId: {
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
            tableName: "FreeCourseLessonProgress",
            timestamps: true,
        }
    );

    FreeCourseLessonProgress.associate = (models) => {
        FreeCourseLessonProgress.belongsTo(models.FreeCourseLesson, {
            foreignKey: "freeCourseLessonId",
            as: "lesson",
        });
    };

    return FreeCourseLessonProgress;
};