'use strict';

// Track meaningful public-content changes, including answer edits/deletions.
// Likes, drafts, private submissions and unapproved reports do not refresh SEO dates.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(`
        CREATE OR REPLACE FUNCTION tps.touch_interview_public_content() RETURNS trigger AS $$
        DECLARE qid bigint;
        BEGIN
          IF TG_TABLE_NAME = 'interview_answers' THEN
            IF TG_OP = 'UPDATE' AND NEW.content IS NOT DISTINCT FROM OLD.content
               AND NEW.status IS NOT DISTINCT FROM OLD.status
               AND NEW.user_name IS NOT DISTINCT FROM OLD.user_name
               AND NEW.is_expert IS NOT DISTINCT FROM OLD.is_expert
               AND NEW.is_pinned IS NOT DISTINCT FROM OLD.is_pinned THEN RETURN NEW; END IF;
            IF TG_OP = 'DELETE' THEN
              IF OLD.status <> 'published' THEN RETURN OLD; END IF;
              qid := OLD.question_id;
            ELSE
              IF NEW.status <> 'published' AND (TG_OP = 'INSERT' OR OLD.status <> 'published') THEN RETURN NEW; END IF;
              qid := NEW.question_id;
            END IF;
          ELSE
            IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
               AND NEW.company_name IS NOT DISTINCT FROM OLD.company_name
               AND NEW.role_name IS NOT DISTINCT FROM OLD.role_name
               AND NEW.interview_timing IS NOT DISTINCT FROM OLD.interview_timing THEN RETURN NEW; END IF;
            IF TG_OP = 'DELETE' THEN
              IF OLD.status <> 'approved' THEN RETURN OLD; END IF;
              qid := OLD.question_id;
            ELSE
              IF NEW.status <> 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN RETURN NEW; END IF;
              qid := NEW.question_id;
            END IF;
          END IF;
          UPDATE tps.interview_questions SET updated_at = now() WHERE id = qid;
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER interview_answers_content_lastmod
          AFTER INSERT OR UPDATE OR DELETE ON tps.interview_answers
          FOR EACH ROW EXECUTE FUNCTION tps.touch_interview_public_content();
        CREATE TRIGGER interview_reports_content_lastmod
          AFTER INSERT OR UPDATE OR DELETE ON tps.interview_reports
          FOR EACH ROW EXECUTE FUNCTION tps.touch_interview_public_content();
      `, { transaction });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS interview_answers_content_lastmod ON tps.interview_answers;
      DROP TRIGGER IF EXISTS interview_reports_content_lastmod ON tps.interview_reports;
      DROP FUNCTION IF EXISTS tps.touch_interview_public_content();
    `);
  },
};
