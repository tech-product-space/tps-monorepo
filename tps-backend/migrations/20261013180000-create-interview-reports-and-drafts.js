"use strict";

const SCHEMA = process.env.DB_SCHEMA || "tps";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. Create interview_reports
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS ${SCHEMA}.interview_reports (
          id BIGSERIAL PRIMARY KEY,
          public_id CHAR(24) NOT NULL UNIQUE,
          question_id BIGINT NOT NULL REFERENCES ${SCHEMA}.interview_questions(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL,
          user_name TEXT,
          company_name TEXT NOT NULL,
          company_logo TEXT,
          role_name TEXT NOT NULL,
          interview_timing VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          reviewed_at TIMESTAMPTZ,
          reviewed_by INTEGER
        );
        CREATE INDEX IF NOT EXISTS interview_reports_question_idx ON ${SCHEMA}.interview_reports (question_id, status);`,
        { transaction }
      );

      // 2. Add columns to interview_answers
      await queryInterface.sequelize.query(
        `ALTER TABLE ${SCHEMA}.interview_answers
          ADD COLUMN IF NOT EXISTS is_expert BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'published';`,
        { transaction }
      );

      // 3. Create interview_answer_drafts
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS ${SCHEMA}.interview_answer_drafts (
          id BIGSERIAL PRIMARY KEY,
          question_id BIGINT NOT NULL REFERENCES ${SCHEMA}.interview_questions(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (question_id, user_id)
        );`,
        { transaction }
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS ${SCHEMA}.interview_answer_drafts;
         DROP TABLE IF EXISTS ${SCHEMA}.interview_reports;
         ALTER TABLE ${SCHEMA}.interview_answers
           DROP COLUMN IF EXISTS is_expert,
           DROP COLUMN IF EXISTS is_pinned,
           DROP COLUMN IF EXISTS status;`,
        { transaction }
      );
    });
  },
};
