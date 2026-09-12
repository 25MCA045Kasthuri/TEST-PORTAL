import { Schema, model, Document, Types } from 'mongoose';
import type { OptionKey } from './Question';

export type AttemptStatus = 'ACTIVE' | 'SUBMITTED' | 'TIMED_OUT' | 'TERMINATED';
export type MalpracticeStatus = 'NORMAL' | 'WARNING' | 'SUSPECTED' | 'CONFIRMED' | 'TERMINATED';

export interface AnswerEntry {
  question: Types.ObjectId;
  questionNumber: number;
  selectedAnswer: OptionKey | null;
  markedForReview: boolean;
  updatedAt: Date;
}

export interface ExamAttemptDoc extends Document {
  candidate: Types.ObjectId;
  sessionId: string;
  startedAt: Date;
  expiresAt: Date;
  submittedAt?: Date | null;
  status: AttemptStatus;
  answers: AnswerEntry[];
  answeredCount: number;
  lastQuestionNumber: number;
  violationCount: number;
  minorViolationCount: number;
  malpracticeStatus: MalpracticeStatus;
  correctAnswers: number;
  wrongAnswers: number;
  unanswered: number;
  rawScore: number;
  finalScore: number;
  durationUsed: number;
  resultCleared: boolean;
  userAgent: string;
  createdAt: Date;
  updatedAt: Date;
}

const answerSchema = new Schema<AnswerEntry>(
  {
    question: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    questionNumber: { type: Number, required: true },
    selectedAnswer: { type: String, enum: ['A', 'B', 'C', 'D', null], default: null },
    markedForReview: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const attemptSchema = new Schema<ExamAttemptDoc>(
  {
    candidate: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUBMITTED', 'TIMED_OUT', 'TERMINATED'],
      default: 'ACTIVE',
      index: true,
    },
    answers: { type: [answerSchema], default: [] },
    answeredCount: { type: Number, default: 0 },
    lastQuestionNumber: { type: Number, default: 1 },
    violationCount: { type: Number, default: 0 },
    minorViolationCount: { type: Number, default: 0 },
    malpracticeStatus: {
      type: String,
      enum: ['NORMAL', 'WARNING', 'SUSPECTED', 'CONFIRMED', 'TERMINATED'],
      default: 'NORMAL',
    },
    correctAnswers: { type: Number, default: 0 },
    wrongAnswers: { type: Number, default: 0 },
    unanswered: { type: Number, default: 0 },
    rawScore: { type: Number, default: 0 },
    finalScore: { type: Number, default: 0 },
    durationUsed: { type: Number, default: 0 },
    resultCleared: { type: Boolean, default: false, index: true },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

attemptSchema.index({ candidate: 1, status: 1 });

export const ExamAttempt = model<ExamAttemptDoc>('ExamAttempt', attemptSchema);
