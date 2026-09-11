import { Schema, model, Document } from 'mongoose';

export type OptionKey = 'A' | 'B' | 'C' | 'D';

export interface QuestionDoc extends Document {
  questionNumber: number;
  question: string;
  options: Record<OptionKey, string>;
  correctAnswer: OptionKey;
  marks: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<QuestionDoc>(
  {
    questionNumber: { type: Number, required: true, unique: true, min: 1, index: true },
    question: { type: String, required: true, trim: true },
    options: {
      A: { type: String, required: true, trim: true },
      B: { type: String, required: true, trim: true },
      C: { type: String, required: true, trim: true },
      D: { type: String, required: true, trim: true },
    },
    correctAnswer: { type: String, required: true, enum: ['A', 'B', 'C', 'D'], select: false },
    marks: { type: Number, default: 1, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Question = model<QuestionDoc>('Question', questionSchema);
