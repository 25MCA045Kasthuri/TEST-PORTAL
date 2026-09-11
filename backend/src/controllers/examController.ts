import { Request, Response } from 'express';
import crypto from 'crypto';
import { ExamAttempt, ExamAttemptDoc, MalpracticeStatus } from '../models/ExamAttempt';
import { Question, OptionKey } from '../models/Question';
import { MalpracticeLog, MAJOR_EVENTS, MalpracticeEvent } from '../models/MalpracticeLog';
import { getSettings } from '../models/Settings';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/respond';
import { ApiError } from '../utils/ApiError';
import { isValidObjectId } from '../services/tokenService';
import { calculateScore } from '../services/scoreService';
import { AnswerInput, ViolationInput } from '../validators/examValidators';

interface AuthRequest extends Request {}

function nowMs(): number {
  return Date.now();
}

async function loadOwnAttempt(candidateId: string, sessionId?: string): Promise<ExamAttemptDoc> {
  const query: Record<string, unknown> = { candidate: candidateId, status: 'ACTIVE' };
  if (sessionId) query.sessionId = sessionId;
  const attempt = await ExamAttempt.findOne(query);
  if (!attempt) {
    throw ApiError.notFound('No active examination found for this session.');
  }
  return attempt;
}

export const examStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const candidateId = req.auth!.sub;
  const settings = await getSettings();
  const attempt = await ExamAttempt.findOne({ candidate: candidateId, status: 'ACTIVE' });

  let state: 'NOT_STARTED' | 'ACTIVE' | 'SUBMITTED' | 'TIMED_OUT' | 'TERMINATED' = 'NOT_STARTED';
  let attemptData: Record<string, unknown> | null = null;

  if (attempt) {
    const now = nowMs();
    if (now >= new Date(attempt.expiresAt).getTime()) {
      const finalized = await finalizeAttempt(attempt, false);
      state = finalized ? 'TIMED_OUT' : 'SUBMITTED';
      attemptData = await buildAttemptDto(finalized ?? attempt);
    } else {
      state = 'ACTIVE';
      attemptData = await buildAttemptDto(attempt);
    }
  } else {
    const last = await ExamAttempt.findOne({ candidate: candidateId }).sort({ createdAt: -1 });
    if (last) {
      state = last.status as typeof state;
      attemptData = { status: last.status, submittedAt: last.submittedAt };
    }
  }

  const remainingSeconds = attempt
    ? Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - nowMs()) / 1000))
    : settings.durationMinutes * 60;

  ok(res, {
    state,
    examEnabled: settings.examEnabled,
    examTitle: settings.examTitle,
    fullScreenRequired: settings.fullscreenRequired,
    durationMinutes: settings.durationMinutes,
    remainingSeconds,
    attempt: attemptData,
  });
});

export const startExam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const candidateId = req.auth!.sub;
  const settings = await getSettings();

  if (!settings.examEnabled) {
    throw ApiError.forbidden('The examination is currently disabled by the administrator.');
  }

  const existing = await ExamAttempt.findOne({ candidate: candidateId, status: 'ACTIVE' });
  if (existing) {
    throw ApiError.conflict(
      'You already have an active examination session. Continue on the same session or contact the administrator.',
    );
  }

  const activeQuestions = await Question.find({ active: true }).sort({ questionNumber: 1 }).lean();
  if (activeQuestions.length === 0) {
    throw ApiError.badRequest('No questions have been published yet. Contact the administrator.');
  }
  const published = activeQuestions.filter((q) => q.questionNumber <= settings.totalQuestions);
  const usable = published.length > 0 ? published : activeQuestions;

  const sessionId = crypto.randomUUID();
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + settings.durationMinutes * 60 * 1000);

  const attempt = await ExamAttempt.create({
    candidate: candidateId,
    sessionId,
    startedAt,
    expiresAt,
    status: 'ACTIVE',
    answers: usable.map((q) => ({
      question: q._id,
      questionNumber: q.questionNumber,
      selectedAnswer: null,
      markedForReview: false,
    })),
    answeredCount: 0,
    lastQuestionNumber: 1,
    violationCount: 0,
    malpracticeStatus: 'NORMAL',
    correctAnswers: 0,
    wrongAnswers: 0,
    unanswered: 0,
    rawScore: 0,
    finalScore: 0,
    durationUsed: 0,
    userAgent: req.headers['user-agent'] ?? '',
  });

  ok(res, await buildAttemptDto(attempt), 'Examination started.');
});

export const getQuestions = asyncHandler(async (req: AuthRequest, res: Response) => {
  await loadOwnAttempt(req.auth!.sub, req.query.sessionId as string | undefined);
  const settings = await getSettings();
  const questions = await Question.find({ active: true })
    .sort({ questionNumber: 1 })
    .select('questionNumber question options marks')
    .lean();

  const usable = questions.filter((q) => q.questionNumber <= settings.totalQuestions);
  ok(res, {
    totalQuestions: settings.totalQuestions,
    questions: usable.map((q) => ({
      _id: q._id,
      questionNumber: q.questionNumber,
      question: q.question,
      options: q.options,
      marks: q.marks,
    })),
  });
});

export const getAttempt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = { candidate: req.auth!.sub, status: 'ACTIVE' };
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  const attempt = await ExamAttempt.findOne(filter);
  if (!attempt) throw ApiError.notFound('No active attempt found.');

  if (nowMs() >= new Date(attempt.expiresAt).getTime()) {
    const finalized = await finalizeAttempt(attempt, false);
    ok(res, await buildAttemptDto(finalized ?? attempt), 'Attempt has ended.');
    return;
  }

  ok(res, await buildAttemptDto(attempt));
});

export const saveAnswer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const candidateId = req.auth!.sub;
  const { questionId, selectedAnswer, clear } = req.body as AnswerInput;
  const attempt = await loadOwnAttempt(candidateId);

  if (nowMs() >= new Date(attempt.expiresAt).getTime()) {
    await finalizeAttempt(attempt, false);
    throw ApiError.badRequest('The examination time has expired and your test was submitted automatically.');
  }
  if (attempt.status !== 'ACTIVE') {
    throw ApiError.badRequest('This examination has already been submitted.');
  }
  if (!isValidObjectId(questionId)) throw ApiError.badRequest('Invalid question id.');

  const question = await Question.findById(questionId).select('questionNumber active').lean();
  if (!question) throw ApiError.badRequest('Question not found.');
  const entry = attempt.answers.find((a) => String(a.question) === questionId);
  if (!entry) throw ApiError.badRequest('This question is not part of your examination.');

  const newAnswer = (clear ? null : selectedAnswer || null) as OptionKey | null;
  const changed = (entry.selectedAnswer ?? null) !== newAnswer;
  if (changed) {
    entry.selectedAnswer = newAnswer;
    entry.updatedAt = new Date();
    entry.markedForReview = false;
    attempt.answeredCount = attempt.answers.filter((a) => a.selectedAnswer !== null).length;
    await attempt.save();
  }

  ok(res, {
    answeredCount: attempt.answeredCount,
    selectedAnswer: entry.selectedAnswer,
    markedForReview: entry.markedForReview,
  }, 'Answer saved.');
});

export const markForReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const candidateId = req.auth!.sub;
  const { questionId, marked = true } = req.body as { questionId: string; marked?: boolean };
  const attempt = await loadOwnAttempt(candidateId);

  if (!isValidObjectId(questionId)) throw ApiError.badRequest('Invalid question id.');
  const entry = attempt.answers.find((a) => String(a.question) === questionId);
  if (!entry) throw ApiError.badRequest('This question is not part of your examination.');

  entry.markedForReview = Boolean(marked);
  await attempt.save();
  ok(res, { markedForReview: entry.markedForReview, questionNumber: entry.questionNumber }, 'Updated.');
});

export const savePosition = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { questionNumber } = req.body as { questionNumber: number };
  const attempt = await loadOwnAttempt(req.auth!.sub);
  if (Number.isInteger(questionNumber) && questionNumber >= 1) {
    attempt.lastQuestionNumber = questionNumber;
    await attempt.save();
  }
  ok(res, { lastQuestionNumber: attempt.lastQuestionNumber });
});
export const recordViolation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const candidateId = req.auth!.sub;
  const { eventType, questionNumber, metadata } = req.body as ViolationInput;
  const now = nowMs();
  const settings = await getSettings();

  const attempt = await ExamAttempt.findOne({ candidate: candidateId, status: 'ACTIVE' });
  if (!attempt) {
    await MalpracticeLog.create({
      candidate: candidateId,
      eventType,
      questionNumber: questionNumber ?? null,
      sessionId: '',
      severity: 'MINOR',
      userAgent: req.headers['user-agent'] ?? '',
      metadata,
    });
    ok(res, { acknowledged: true, applied: false }, 'Event logged.');
    return;
  }

  const isMajor = MAJOR_EVENTS.includes(eventType as MalpracticeEvent);
  const severity = isMajor ? 'MAJOR' : 'MINOR';

  let newStatus: MalpracticeStatus = attempt.malpracticeStatus;
  let autoTerminated = false;
  let violationApplied = false;

  if (isMajor) {
    const lastLog = await MalpracticeLog.findOne({ attempt: attempt._id }).sort({ timestamp: -1 });
    const recent = lastLog && now - new Date(lastLog.timestamp).getTime() < 2000;
    const flaggedDuplicate = Boolean(
      recent && lastLog!.eventType === eventType && (metadata as { duplicate?: boolean })?.duplicate,
    );
    if (!flaggedDuplicate) {
      attempt.violationCount += 1;
      violationApplied = true;
      if (attempt.violationCount >= settings.maxViolations && settings.autoTerminateEnabled) {
        newStatus = 'TERMINATED';
        autoTerminated = true;
      } else if (newStatus === 'NORMAL') {
        newStatus = 'WARNING';
      } else if (newStatus === 'WARNING') {
        newStatus = 'SUSPECTED';
      }
    }
  } else if (attempt.malpracticeStatus === 'NORMAL') {
    attempt.malpracticeStatus = 'WARNING';
  }

  await MalpracticeLog.create({
    candidate: candidateId,
    attempt: attempt._id,
    eventType,
    questionNumber: questionNumber ?? null,
    sessionId: attempt.sessionId,
    severity,
    userAgent: req.headers['user-agent'] ?? '',
    metadata,
  });

  if (autoTerminated) {
    const finalized = await finalizeAttempt(attempt, false, 'TERMINATED');
    ok(res, {
      acknowledged: true,
      violationCount: finalized ? finalized.violationCount : attempt.violationCount,
      status: 'TERMINATED',
      malpracticeStatus: 'TERMINATED',
      terminated: true,
      message: 'Maximum violations reached. Your examination has been automatically submitted.',
    });
    return;
  }

  attempt.malpracticeStatus = newStatus;
  await attempt.save();

  ok(res, {
    acknowledged: true,
    violationCount: attempt.violationCount,
    malpracticeStatus: attempt.malpracticeStatus,
    violationApplied,
    terminated: false,
  }, 'Event recorded.');
});

export const submitExam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const candidateId = req.auth!.sub;
  const attempt = await ExamAttempt.findOne({ candidate: candidateId, status: 'ACTIVE' });
  if (!attempt) throw ApiError.notFound('No active examination to submit.');

  const finalized = await finalizeAttempt(attempt, true);
  if (!finalized) throw ApiError.badRequest('The examination was already submitted.');

  ok(res, await buildAttemptDto(finalized), 'Examination submitted successfully.');
});

export async function finalizeAttempt(
  attempt: ExamAttemptDoc,
  manual: boolean,
  forcedStatus?: 'SUBMITTED' | 'TIMED_OUT' | 'TERMINATED',
): Promise<ExamAttemptDoc | null> {
  if (attempt.status !== 'ACTIVE') return null;

  const submittedAt = new Date();
  const startedAtMs = new Date(attempt.startedAt).getTime();
  const expiresMs = new Date(attempt.expiresAt).getTime();
  const durationUsed =
    expiresMs > submittedAt.getTime()
      ? Math.round((submittedAt.getTime() - startedAtMs) / 1000)
      : Math.round((expiresMs - startedAtMs) / 1000);

  const score = await calculateScore(attempt.answers);
  const status = forcedStatus ?? (manual ? 'SUBMITTED' : 'TIMED_OUT');
  const malpracticeStatus: MalpracticeStatus =
    status === 'TERMINATED' ? 'TERMINATED' : attempt.malpracticeStatus;

  attempt.submittedAt = submittedAt;
  attempt.status = status;
  attempt.malpracticeStatus = malpracticeStatus;
  attempt.correctAnswers = score.correctAnswers;
  attempt.wrongAnswers = score.wrongAnswers;
  attempt.unanswered = score.unanswered;
  attempt.rawScore = score.rawScore;
  attempt.finalScore = malpracticeStatus === 'CONFIRMED' || malpracticeStatus === 'TERMINATED' ? 0 : score.rawScore;
  attempt.durationUsed = Math.max(0, durationUsed);
  await attempt.save();
  return attempt;
}

async function buildAttemptDto(attempt: ExamAttemptDoc): Promise<Record<string, unknown>> {
  const now = nowMs();
  const remainingSeconds = Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - now) / 1000));
  return {
    attemptId: attempt._id,
    sessionId: attempt.sessionId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    remainingSeconds,
    answeredCount: attempt.answeredCount,
    violationCount: attempt.violationCount,
    malpracticeStatus: attempt.malpracticeStatus,
    lastQuestionNumber: attempt.lastQuestionNumber,
    submittedAt: attempt.submittedAt ?? null,
    answers: attempt.answers.map((a) => ({
      question: a.question,
      questionNumber: a.questionNumber,
      selectedAnswer: a.selectedAnswer,
      markedForReview: a.markedForReview,
    })),
  };
}