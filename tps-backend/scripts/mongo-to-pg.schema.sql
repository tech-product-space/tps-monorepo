-- tps: Mongo -> Postgres. Applied to schema "tps" of the target database.
-- Replaces: models/mongo/Otp.js, SavedQuestion.js, InterviewQuestion.js

CREATE TABLE IF NOT EXISTS tps.otps (
  id                 BIGSERIAL PRIMARY KEY,
  phone              TEXT NOT NULL,
  country_code       TEXT NOT NULL,
  entity             TEXT NOT NULL,
  entity_identifier  TEXT NOT NULL,
  otp                TEXT NOT NULL,
  attempts           INTEGER NOT NULL DEFAULT 0,
  retry_attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otps_phone_idx ON tps.otps (phone);
CREATE INDEX IF NOT EXISTS otps_entity_identifier_idx ON tps.otps (entity_identifier);
CREATE INDEX IF NOT EXISTS otps_expires_at_idx ON tps.otps (expires_at);

CREATE TABLE IF NOT EXISTS tps.interview_questions (
  id           BIGSERIAL PRIMARY KEY,
  public_id    CHAR(24) NOT NULL UNIQUE, -- the API's `_id`; migrated rows keep their Mongo ObjectId
  title        TEXT NOT NULL,
  meta_title   TEXT,
  meta_desc    TEXT,
  slug         VARCHAR(255) UNIQUE,       -- NULL allowed (one legacy row has none)
  phone        VARCHAR(32),
  roles        TEXT[] NOT NULL DEFAULT '{}',
  types        TEXT[] NOT NULL DEFAULT '{}',
  company      TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  user_id      INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tps.interview_answers (
  id          BIGSERIAL PRIMARY KEY,
  public_id   CHAR(24) NOT NULL UNIQUE,
  question_id BIGINT NOT NULL REFERENCES tps.interview_questions(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL,
  user_name   TEXT NOT NULL,
  is_member   BOOLEAN NOT NULL,
  content     TEXT NOT NULL,
  liked_by    INTEGER[] NOT NULL DEFAULT '{}',   -- was likes: [Number]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interview_answers_question_idx ON tps.interview_answers (question_id);

CREATE TABLE IF NOT EXISTS tps.interview_feedback (
  id          BIGSERIAL PRIMARY KEY,
  public_id   CHAR(24) NOT NULL UNIQUE,
  answer_id   BIGINT NOT NULL REFERENCES tps.interview_answers(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL,
  user_name   TEXT NOT NULL,
  is_member   BOOLEAN NOT NULL,
  feedback_text TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ               -- NULL for legacy feedback that never had one
);
CREATE INDEX IF NOT EXISTS interview_feedback_answer_idx ON tps.interview_feedback (answer_id);

CREATE TABLE IF NOT EXISTS tps.saved_questions (
  id          BIGSERIAL PRIMARY KEY,
  public_id   CHAR(24) NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL,
  question_id BIGINT NOT NULL REFERENCES tps.interview_questions(id) ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);
