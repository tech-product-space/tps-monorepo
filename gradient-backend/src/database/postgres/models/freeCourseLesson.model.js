import { DataTypes } from "sequelize";
import { ulid } from "ulid";

export default (sequelize) => {
    const FreeCourseLesson = sequelize.define(
        "FreeCourseLesson",
        {
            id: {
                type: DataTypes.STRING,
                primaryKey: true,
                defaultValue: () => ulid(),
            },

            freeCourseModuleId: {
                type: DataTypes.STRING,
                allowNull: false,
            },

            title: {
                type: DataTypes.STRING,
                allowNull: false,
            },

            slug: {
                type: DataTypes.STRING,
                allowNull: false,
            },

            order: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },

            content: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {},
            },

            isPublished: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },

            seo: {
                type: DataTypes.JSONB,
                defaultValue: {},
            },
        },
        {
            tableName: "FreeCourseLessons",
            timestamps: true,
        }
    );

    FreeCourseLesson.associate = (models) => {
        FreeCourseLesson.belongsTo(models.FreeCourseModule, {
            foreignKey: "freeCourseModuleId",
        });
    };

    return FreeCourseLesson;
};