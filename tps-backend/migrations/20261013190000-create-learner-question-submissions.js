"use strict";

const SCHEMA = process.env.DB_SCHEMA || "tps";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS ${SCHEMA}.learner_question_submissions (
          id BIGSERIAL PRIMARY KEY,
          public_id CHAR(24) NOT NULL UNIQUE,
          user_id INTEGER NOT NULL,
          user_name TEXT,
          user_email TEXT,
          title TEXT NOT NULL,
          context TEXT,
          categories TEXT[] NOT NULL DEFAULT '{}',
          role TEXT,
          custom_role TEXT,
          is_interview BOOLEAN NOT NULL DEFAULT false,
          company TEXT,
          interview_timing VARCHAR(64),
          notify_on_answer BOOLEAN NOT NULL DEFAULT true,
          status VARCHAR(32) NOT NULL DEFAULT 'pending',
          rejection_reason TEXT,
          canonical_question_id BIGINT REFERENCES ${SCHEMA}.interview_questions(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          reviewed_at TIMESTAMPTZ,
          reviewed_by INTEGER
        );
        CREATE INDEX IF NOT EXISTS learner_question_submissions_user_idx ON ${SCHEMA}.learner_question_submissions (user_id);
        CREATE INDEX IF NOT EXISTS learner_question_submissions_status_idx ON ${SCHEMA}.learner_question_submissions (status);`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS ${SCHEMA}.learner_question_submissions CASCADE;`,
        { transaction }
      );
    });
  },
};
