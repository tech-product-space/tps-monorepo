// Normalizes the per-blog quiz payload before it is persisted.
//
// The quiz is authored in the admin editor and scored client-side on the public
// site, so the shape has to stay trustworthy: every stored question needs text,
// at least two non-empty options, and an answerIndex that points at one of them.
// Anything that fails those rules is dropped rather than saved half-formed.

const MAX_OPTIONS = 4;

const asText = (value) => (typeof value === "string" ? value.trim() : "");

const sanitizeQuestion = (raw, position) => {
  if (!raw || typeof raw !== "object") return null;

  const question = asText(raw.question);
  if (!question) return null;

  if (!Array.isArray(raw.options)) return null;
  const options = raw.options.slice(0, MAX_OPTIONS).map(asText);
  if (options.filter(Boolean).length < 2) return null;

  const answerIndex = Number(raw.answerIndex);
  if (
    !Number.isInteger(answerIndex) ||
    answerIndex < 0 ||
    answerIndex >= options.length ||
    !options[answerIndex]
  ) {
    return null;
  }

  return {
    id: asText(raw.id) || `q_${position}`,
    question,
    options,
    answerIndex,
  };
};

const sanitizeQuiz = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { enabled: false, questions: [] };
  }

  const source = Array.isArray(raw.questions) ? raw.questions : [];
  const questions = source
    .map((question, i) => sanitizeQuestion(question, i))
    .filter(Boolean);

  // A quiz with nothing valid left in it can never render, so never leave it on.
  return { enabled: Boolean(raw.enabled) && questions.length > 0, questions };
};

export default sanitizeQuiz;
