const mongoose = require('mongoose');
const { Schema } = mongoose;

const savedQuestionSchema = new Schema({
  userId: { type: Number, required: true },            // numeric userId from Postgres
  questionId: { type: Schema.Types.ObjectId, ref: 'InterviewQuestion', required: true },
  savedAt: { type: Date, default: Date.now }
});

savedQuestionSchema.index({ userId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('SavedQuestion', savedQuestionSchema);