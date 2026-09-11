import { Question } from '../models/Question';
import { ExamAttempt, AnswerEntry, MalpracticeStatus } from '../models/ExamAttempt';

export interface ScoreResult {
  correctAnswers: number;
  wrongAnswers: number;
  unanswered: number;
  rawScore: number;
  userAnswers: Array<{ question: string; questionNumber: number; selectedAnswer: string | null }>;
}

/**
 * Calculates the score for an attempt using the authoritative correct answers
 * stored in Mongo. This must only be called server-side.
 */
export async function calculateScore(answerEntries: AnswerEntry[]): Promise<ScoreResult> {
  const questionIds = answerEntries.map((a) => a.question);
  const questions = await Question.find({ _id: { $in: questionIds } })
    .select('correctAnswer questionNumber marks')
    .lean();

  const byId = new Map(questions.map((q) => [String(q._id), q]));

  let correctAnswers = 0;
  let wrongAnswers = 0;
  let unanswered = 0;
  let rawScore = 0;

  for (const entry of answerEntries) {
    const question = byId.get(String(entry.question));
    const selected = entry.selectedAnswer ?? null;
    if (!selected) {
      unanswered += 1;
    } else if (question && selected === question.correctAnswer) {
      correctAnswers += 1;
      rawScore += question.marks ?? 1;
    } else {
      wrongAnswers += 1;
    }
  }

  return {
    correctAnswers,
    wrongAnswers,
    unanswered,
    rawScore,
    userAnswers: answerEntries.map((a) => ({
      question: String(a.question),
      questionNumber: a.questionNumber,
      selectedAnswer: a.selectedAnswer ?? null,
    })),
  };
}

/**
 * Applies the malpractice score policy. The raw score is always preserved;
 * only the final score is zeroed when malpractice is confirmed/terminated.
 */
export function finalScoreFrom(rawScore: number, status: MalpracticeStatus): number {
  if (status === 'CONFIRMED' || status === 'TERMINATED') return 0;
  return rawScore;
}