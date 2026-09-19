const mongoose = require('mongoose');
const { Schema } = mongoose;

const feedbackSchema = new Schema({
  userId: { type: Number, required: true },
  userName: { type: String, required: true },
  isMember: { type: Boolean, required: true },
  feedbackText: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const answerSchema = new Schema({
  userId: { type: Number, required: true },
  userName: { type: String, required: true },
  isMember: { type: Boolean, required: true },
  content: { type: String, required: true },
  likes: [{ type: Number }],
  feedback: [feedbackSchema],
  createdAt: { type: Date, default: Date.now }
});

const interviewQuestionSchema = new Schema({
  title: { type: String, required: true },
  metaTitle: { type: String },
  metaDesc: { type: String },
  slug: { type: String, unique: true, index: true },
  phone: { type: String },
  role: [{ type: String }],
  isPublished: { type: Boolean, default: false },
  company: { type: String },
  type: [{ type: String }],
  userId: { type: Number, required: true },
  answers: [answerSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InterviewQuestion', interviewQuestionSchema);