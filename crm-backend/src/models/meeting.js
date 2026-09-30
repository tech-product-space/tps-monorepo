"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Meeting extends Model {
    static associate(models) {
      Meeting.belongsTo(models.Lead, { foreignKey: "lead_id", as: "Lead" });
      Meeting.belongsTo(models.LeadProfile, {
        foreignKey: "profile_id",
        as: "Profile",
      });
      Meeting.belongsTo(models.User, {
        foreignKey: "organizer_id",
        as: "Organizer",
      });
      Meeting.belongsTo(models.User, {
        foreignKey: "outcome_by",
        as: "OutcomeActor",
      });
      Meeting.belongsTo(models.LeadNote, {
        foreignKey: "outcome_note_id",
        as: "OutcomeNote",
      });
      Meeting.belongsTo(models.Meeting, {
        foreignKey: "next_meeting_id",
        as: "NextMeeting",
      });
    }
  }
  Meeting.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lead_id: { type: DataTypes.UUID, allowNull: false },
      profile_id: { type: DataTypes.UUID, allowNull: false },
      // Which system owns this booking's lifecycle. A "calcom" row mirrors a
      // Cal.com booking that also lives on its Lead's extra_fields; the CRM
      // never books or cancels those, it only records what happened at them.
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "google",
        validate: { isIn: [["google", "calcom"]] },
      },
      // Cal.com's booking identity — the webhook's upsert key, and unique among
      // non-null values so a retried delivery updates rather than duplicates.
      calcom_uid: { type: DataTypes.STRING(255), allowNull: true },
      // Cal.com's own status (Booked/Rescheduled/Cancelled), verbatim. Distinct
      // from `status`: theirs describes the booking, ours whether it stands.
      calcom_status: { type: DataTypes.STRING(32), allowNull: true },
      // Null for Cal.com bookings: nobody in the team has picked the lead up
      // yet. The booking cron already routes those to Superadmins.
      organizer_id: { type: DataTypes.UUID, allowNull: true },
      // Null for Cal.com bookings — there is no Google Calendar event behind
      // them. Always set for source "google".
      google_event_id: { type: DataTypes.STRING(255), allowNull: true },
      calendar_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "primary",
      },
      meet_link: { type: DataTypes.STRING(500), allowNull: true },
      title: { type: DataTypes.STRING(500), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      start_time: { type: DataTypes.DATE, allowNull: false },
      end_time: { type: DataTypes.DATE, allowNull: false },
      timezone: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "Asia/Kolkata",
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "scheduled",
        validate: { isIn: [["scheduled", "cancelled"]] },
      },
      status_synced: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // The human verdict on a meeting that has already ended. Null means
      // nobody has said what happened yet — that, not the clock, is what puts
      // a meeting in the Needs-outcome queue.
      outcome: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: { isIn: [["attended", "no_show", "cancelled_late"]] },
      },
      outcome_at: { type: DataTypes.DATE, allowNull: true },
      outcome_by: { type: DataTypes.UUID, allowNull: true },
      outcome_note_id: { type: DataTypes.UUID, allowNull: true },
      next_meeting_id: { type: DataTypes.UUID, allowNull: true },
      attendees: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      attachments: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
    },
    {
      sequelize,
      modelName: "Meeting",
      tableName: "meetings",
      underscored: true,
    },
  );
  return Meeting;
};
