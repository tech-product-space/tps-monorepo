import { EVENT_TYPES } from "../../../config/constants/event.js";
import { DataTypes } from "sequelize";
import { ulid } from "ulid";

export default (sequelize) => {
    const Event = sequelize.define(
        "Event",
        {
            id: {
                type: DataTypes.STRING,
                primaryKey: true,
                defaultValue: () => ulid(),
            },

            eventTitle: {
                type: DataTypes.STRING,
                allowNull: true,
            },

            eventSubtitle: {
                type: DataTypes.STRING,
                allowNull: true,
            },

            eventStartDate: {
                type: DataTypes.STRING,
                allowNull: true,
            },

            eventEndDate: {
                type: DataTypes.STRING,
                allowNull: true,
            },

            eventStartTime: {
                type: DataTypes.STRING,
                allowNull: true,
            },

            eventEndTime: {
                type: DataTypes.STRING,
                allowNull: true,
            },

            speakers: {
                type: DataTypes.JSONB,
                allowNull: true,
                defaultValue: [],
            },

            numberOfAttendees: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },

            eventCreativeUrl: {
                type: DataTypes.STRING,
                allowNull: true,
            },

            isPublished: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },

            eventType: {
                type: DataTypes.STRING,
                allowNull: true,
                validate: {
                    // Shared with `Recordings.format`; see EVENT_TYPES.
                    isIn: [[...EVENT_TYPES]],
                },
            },

            eventCategory: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: "Normal",
                validate: {
                    isIn: [
                        [
                            "Community",
                            "Normal"
                        ],
                    ],
                },
            },

            ctaType: {
                type: DataTypes.STRING,
                allowNull: true,
            },

            location: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            locationType: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            tags: {
                type: DataTypes.ARRAY(DataTypes.STRING),
                allowNull: true,
                defaultValue: [],
            },

            eventDetails: {
                type: DataTypes.JSONB,
                allowNull: true,
                defaultValue: {},
            },

            seo: {
                type: DataTypes.JSONB,
                allowNull: true,
                defaultValue: {},
            },

            eventSlug: {
                type: DataTypes.STRING,
                allowNull: true,
                unique: true,
            },

            canAcceptResponse: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },

            scheduledAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },

            // Feedback + certificate switches. Never read this raw — go through
            // resolveEventSettings(event), which layers EVENT_SETTINGS_DEFAULTS
            // underneath so a row saved before a key existed still behaves.
            settings: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {},
            },
        },
        {
            tableName: "Events",
            timestamps: true,
        }
    );

    Event.associate = (models) => {
        Event.hasMany(models.EventFeedback, {
            foreignKey: "eventId",
            as: "feedbacks",
        });

        Event.hasOne(models.EventCertificateTemplate, {
            foreignKey: "eventId",
            as: "certificateTemplate",
        });

        Event.hasMany(models.EventCertificate, {
            foreignKey: "eventId",
            as: "certificates",
        });
    };

    return Event;
};