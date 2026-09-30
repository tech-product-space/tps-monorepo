import { DataTypes } from "sequelize";
import { ulid } from "ulid";

export default (sequelize) => {
    const FreeCourseModule = sequelize.define(
        "FreeCourseModule",
        {
            id: {
                type: DataTypes.STRING,
                primaryKey: true,
                defaultValue: () => ulid(),
            },

            freeCourseId: {
                type: DataTypes.STRING,
                allowNull: false,
            },

            title: {
                type: DataTypes.STRING,
                allowNull: false,
            },

            subTitle: DataTypes.STRING,

            slug: {
                type: DataTypes.STRING,
                allowNull: false,
            },

            seo: {
                type: DataTypes.JSONB,
                defaultValue: {},
            },

            isPublished: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },

            overview: {
                type: DataTypes.JSONB,
                defaultValue: {},
            },

            order: {
                type: DataTypes.INTEGER,
                defaultValue: 0,
            },
        },
        {
            tableName: "FreeCourseModules",
            timestamps: true,
        }
    );

    FreeCourseModule.associate = (models) => {
        FreeCourseModule.belongsTo(models.FreeCourse, {
            foreignKey: "freeCourseId",
        });

        FreeCourseModule.hasMany(models.FreeCourseLesson, {
            foreignKey: "freeCourseModuleId",
            as: "lessons",
        });
    };

    return FreeCourseModule;
};