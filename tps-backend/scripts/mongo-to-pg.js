// One-off: copy tps Mongo data (interviewquestions, savedquestions, otps) into
// Postgres schema "tps". Mongo is read-only here. Refuses to write to anything
// other than the target DB named in PG_TARGET_DB (guard against touching prod).
//
//   PG_URL=postgres://ps_app:...@127.0.0.1:15432/productspace_dryrun \
//   PG_TARGET_DB=productspace_dryrun node scripts/mongo-to-pg.js
require('dotenv').config();
const mongoose = require('mongoose');
const { Client } = require('pg');

const targetDb = process.env.PG_TARGET_DB;
if (!targetDb || (targetDb === "productspace" && process.env.CONFIRM_PRODUCTION_WRITE !== "yes")) {
  throw new Error('Refusing: PG_TARGET_DB must be set and must not be "productspace"');
}
const pgUrl = process.env.PG_URL;
if (!pgUrl || !pgUrl.endsWith('/' + targetDb)) {
  throw new Error('Refusing: PG_URL does not point at PG_TARGET_DB');
}

const oid = (x) => String(x);
const ts = (d) => (d ? new Date(d) : new Date());

(async () => {
  await mongoose.connect(process.env.MONGO_DB_URL);
  const m = mongoose.connection.db;
  const srcQ = await m.collection('interviewquestions').find().toArray();
  const srcS = await m.collection('savedquestions').find().toArray();
  const srcO = await m.collection('otps').find().toArray();

  const pg = new Client({ connectionString: pgUrl });
  await pg.connect();
  const report = { skippedOrphanSaves: 0, skippedDuplicateSaves: 0 };
  try {
    await pg.query('BEGIN');
    // Idempotent for the dry run: clear target tables first (scratch DB only).
    await pg.query('TRUNCATE tps.saved_questions, tps.interview_feedback, tps.interview_answers, tps.interview_questions, tps.otps RESTART IDENTITY CASCADE');

    const qMap = new Map();   // mongo question _id -> pg id
    const aMap = new Map();   // mongo answer _id   -> pg id
    for (const q of srcQ) {
      const r = await pg.query(
        `INSERT INTO tps.interview_questions
           (public_id, title, meta_title, meta_desc, slug, phone, roles, types, company,
            is_published, user_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [oid(q._id), q.title, q.metaTitle ?? null, q.metaDesc ?? null,
         q.slug || null, q.phone ?? null, q.role || [], q.type || [],
         q.company ?? null, !!q.isPublished, q.userId, ts(q.createdAt), ts(q.updatedAt)]
      );
      qMap.set(oid(q._id), r.rows[0].id);

      for (const a of q.answers || []) {
        const ra = await pg.query(
          `INSERT INTO tps.interview_answers
             (public_id, question_id, user_id, user_name, is_member, content, liked_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [oid(a._id), r.rows[0].id, a.userId, a.userName, !!a.isMember,
           a.content, (a.likes || []).map(Number), ts(a.createdAt)]
        );
        aMap.set(oid(a._id), ra.rows[0].id);

        for (const f of a.feedback || []) {
          await pg.query(
            `INSERT INTO tps.interview_feedback
               (public_id, answer_id, user_id, user_name, is_member, feedback_text, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [oid(f._id), ra.rows[0].id, f.userId, f.userName, !!f.isMember,
             f.feedbackText, ts(f.createdAt), f.updatedAt ? new Date(f.updatedAt) : null]
          );
        }
      }
    }

    for (const s of srcS) {
      const qid = qMap.get(oid(s.questionId));
      if (!qid) { report.skippedOrphanSaves++; continue; }
      const r = await pg.query(
        `INSERT INTO tps.saved_questions (public_id, user_id, question_id, saved_at)
         VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, question_id) DO NOTHING RETURNING id`,
        [oid(s._id), s.userId, qid, ts(s.savedAt)]
      );
      if (r.rowCount === 0) report.skippedDuplicateSaves++;
    }

    // otps: transient (TTL-expired in Mongo). Migrate any still-valid rows only.
    let otpsCopied = 0;
    for (const o of srcO) {
      if (new Date(o.expiresAt) <= new Date()) continue;
      await pg.query(
        `INSERT INTO tps.otps (phone, country_code, entity, entity_identifier, otp, attempts,
                               retry_attempts, expires_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [o.phone, o.countryCode, o.entity, o.entityIdentifier, o.otp, o.attempts || 0,
         o.retryAttempts || 0, o.expiresAt, ts(o.createdAt), ts(o.updatedAt)]
      );
      otpsCopied++;
    }

    await pg.query('COMMIT');

    const count = async (t) => Number((await pg.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
    const answersPg = await count('tps.interview_answers');
    const feedbackPg = await count('tps.interview_feedback');
    const likesPg = Number((await pg.query('SELECT coalesce(sum(cardinality(liked_by)),0) AS n FROM tps.interview_answers')).rows[0].n);
    const savedPg = await count('tps.saved_questions');

    const srcAnswers = srcQ.reduce((n, q) => n + (q.answers || []).length, 0);
    const srcFeedback = srcQ.reduce((n, q) => n + (q.answers || []).reduce((k, a) => k + (a.feedback || []).length, 0), 0);
    const srcLikes = srcQ.reduce((n, q) => n + (q.answers || []).reduce((k, a) => k + (a.likes || []).length, 0), 0);
    const expectedSaved = srcS.length - report.skippedOrphanSaves - report.skippedDuplicateSaves;

    console.log(JSON.stringify({
      reconciliation: {
        questions:  { source: srcQ.length,    target: await count('tps.interview_questions') },
        answers:    { source: srcAnswers,     target: answersPg },
        feedback:   { source: srcFeedback,    target: feedbackPg },
        likes:      { source: srcLikes,       target: likesPg },
        saved:      { source: srcS.length,    target: savedPg, skippedOrphans: report.skippedOrphanSaves, skippedDuplicates: report.skippedDuplicateSaves, expectedTarget: expectedSaved },
        otps:       { source: srcO.length, copiedValidOnly: otpsCopied, target: await count('tps.otps') },
      },
    }, null, 2));
  } catch (e) {
    await pg.query('ROLLBACK');
    throw e;
  } finally {
    await pg.end();
    await mongoose.disconnect();
  }
})().catch((e) => { console.error('MIGRATION FAILED:', e.message); process.exit(1); });
