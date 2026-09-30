/**
 * Drops the recording → course cross-sell link.
 *
 * The "GO DEEPER WITH THE COURSE" card on the public detail page became static
 * copy, written in `RecordingSidebar.tsx` on the website: one promotion, shown
 * on every recording. Nothing reads `relatedCourseId` any more, so leaving it
 * would leave a picker in the admin panel that saves a value with no effect —
 * the worst kind of dead field, because it looks like it works.
 *
 * `removeColumn` takes the foreign key to `Courses` and the
 * `recordings_related_course_id` index with it; Postgres drops both as
 * dependants, so naming them here would only add a step that can fail.
 *
 * `down` restores the column, the key and the index, but not the links that
 * were in it — those are gone with the column. Re-linking is manual.
 */
export default {
  async up(queryInterface) {
    await queryInterface.removeColumn("Recordings", "relatedCourseId");

    // The matching switch in `Recordings.settings`. Harmless if left — settings
    // are read through a defaults merge, so an unknown key is simply never
    // looked up — but a switch for a feature that no longer exists is a
    // question waiting to be asked by whoever reads the JSON next.
    await queryInterface.sequelize.query(
      `UPDATE "Recordings" SET "settings" = "settings" - 'showRelatedCourse'`,
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Recordings", "relatedCourseId", {
      type: Sequelize.STRING,
      allowNull: true,
      references: { model: "Courses", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("Recordings", ["relatedCourseId"], {
      name: "recordings_related_course_id",
    });

    await queryInterface.sequelize.query(
      `UPDATE "Recordings" SET "settings" = "settings" || '{"showRelatedCourse": true}'::jsonb`,
    );
  },
};
