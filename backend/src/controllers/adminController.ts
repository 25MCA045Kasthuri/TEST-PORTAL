import { Request, Response } from 'express';
import { Candidate } from '../models/Candidate';
import { Question } from '../models/Question';
import { ExamAttempt } from '../models/ExamAttempt';
import { MalpracticeLog } from '../models/MalpracticeLog';
import { getSettings } from '../models/Settings';
import { asyncHandler } from '../utils/asyncHandler';
import { ok, created } from '../utils/respond';
import { ApiError } from '../utils/ApiError';
import { isValidExcelUpload } from '../utils/excelUpload';
import { isValidObjectId } from '../services/tokenService';
import { finalScoreFrom } from '../services/scoreService';
import {
  generateCandidatePassword,
  hashCandidatePassword,
  isValidCandidateUid,
} from '../services/candidatePassword';
import {
  latestAttemptPerCandidate,
  isRankable,
  computeRanks,
  sortFinalAttempts,
  toFinalAttempt,
  byScoreThenTime,
  ResultSortKey,
} from '../services/rankingService';
import {
  parseQuestionFile,
  exportResultsToExcel,
  parseCandidateFile,
  persistQuestionImport,
  QuestionImportResult,
  ParsedCandidateRow,
} from '../services/excelService';
import {
  CreateCandidateInput,
  UpdateCandidateInput,
  CreateQuestionInput,
  SettingsInput,
} from '../validators/adminValidators';
import { normalizeUid } from '../validators/authValidators';

interface AuthRequest extends Request {}

interface ListQuery {
  search?: string;
  status?: string;
  page?: string;
  limit?: string;
  sortBy?: string;
  order?: string;
  sort?: string;
}

const FINALIZED_STATUSES = ['SUBMITTED', 'TIMED_OUT', 'TERMINATED'] as const;

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

function pagination(query: ListQuery): { skip: number; limit: number; page: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { skip: (page - 1) * limit, limit, page };
}

export const dashboard = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const [registered, active, completed, settings, violationCount, terminated, activeQuestionCount] =
    await Promise.all([
      Candidate.countDocuments(),
      ExamAttempt.countDocuments({ status: 'ACTIVE' }),
      ExamAttempt.countDocuments({ status: { $in: ['SUBMITTED', 'TIMED_OUT', 'TERMINATED'] } }),
      getSettings(),
      MalpracticeLog.countDocuments({ eventType: { $ne: 'MULTIPLE_LOGIN_ATTEMPT' } }),
      ExamAttempt.countDocuments({ status: 'TERMINATED' }),
      Question.countDocuments({ active: true }),
    ]);

  const distinctCandidates = await ExamAttempt.find().select('candidate').lean();
  const notStarted = Math.max(0, registered - new Set(distinctCandidates.map((a) => String(a.candidate))).size);

  ok(res, {
    registeredCandidates: registered,
    notStarted,
    currentlyWriting: active,
    completed,
    malpracticeFlags: violationCount,
    terminatedSessions: terminated,
    activeQuestionCount,
    settings: {
      examTitle: settings.examTitle,
      durationMinutes: settings.durationMinutes,
      totalQuestions: settings.totalQuestions,
      examEnabled: settings.examEnabled,
    },
  });
});

/**
 * Reset Dashboard.
 *
 * Dashboard metrics are derived live from Candidates, Questions, ExamAttempts,
 * MalpracticeLog and Settings. There is no dashboard-specific collection, cache or
 * persistent state to delete, so this endpoint intentionally performs NO database
 * mutation. It exists so the Dashboard reset follows the same admin-only UI/API
 * pattern as the other list resets; the client clears its local view state and
 * refetches freshly recalculated metrics.
 */
export const resetDashboard = asyncHandler(async (_req: AuthRequest, res: Response) => {
  ok(res, { reset: true, derived: true }, 'Dashboard reset successfully.');
});

export const listCandidates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = req.query as unknown as ListQuery;
  const { search, status } = query;
  const { skip, limit, page } = pagination(query);

  const filter: Record<string, unknown> = {};
  if (search && search.trim()) {
    const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { uid: { $regex: safe, $options: 'i' } },
      { name: { $regex: safe, $options: 'i' } },
      { mobile: { $regex: safe, $options: 'i' } },
      { department: { $regex: safe, $options: 'i' } },
      { college: { $regex: safe, $options: 'i' } },
    ];
  }

  const [candidates, total] = await Promise.all([
    Candidate.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Candidate.countDocuments(filter),
  ]);

  const attemptFilter: Record<string, unknown> = { candidate: { $in: candidates.map((c) => c._id) } };
  if (status) attemptFilter.status = status;
  const attemptInfo = await ExamAttempt.find(attemptFilter)
    .sort({ createdAt: -1 })
    .select('candidate status malpracticeStatus rawScore finalScore startedAt submittedAt')
    .lean();

  const byCandidate = new Map<string, (typeof attemptInfo)[number]>();
  for (const a of attemptInfo) {
    if (!byCandidate.has(String(a.candidate))) byCandidate.set(String(a.candidate), a);
  }

  const data = candidates.map((c) => {
    const attempt = byCandidate.get(String(c._id));
    return {
      _id: c._id,
      uid: c.uid,
      name: c.name,
      mobile: c.mobile,
      college: c.college,
      department: c.department,
      active: c.active,
      examStatus: attempt?.status ?? 'NOT_STARTED',
      malpracticeStatus: attempt?.malpracticeStatus ?? 'NORMAL',
      rawScore: attempt?.rawScore ?? null,
      finalScore: attempt?.finalScore ?? null,
    };
  });

  ok(res, { candidates: data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

export const createCandidate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = req.body as CreateCandidateInput;
  const uid = normalizeUid(input.uid);
  const exists = await Candidate.findOne({ uid });
  if (exists) throw ApiError.conflict('A candidate with this UID already exists.');

  const defaultPassword = generateCandidatePassword(uid);
  const passwordHash = await hashCandidatePassword(defaultPassword);
  const candidate = await Candidate.create({
    uid,
    name: input.name,
    mobile: input.mobile,
    college: input.college ?? '',
    department: input.department ?? '',
    passwordHash,
    active: true,
  });
  created(
    res,
    { ...candidate.toJSON(), defaultPassword },
    'Candidate created.',
  );
});
function isSpreadsheetFile(file?: Express.Multer.File): file is Express.Multer.File {
  return isValidExcelUpload(file);
}

export const importCandidates = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No Excel file was received by the server.');
  if (!isSpreadsheetFile(req.file)) throw ApiError.badRequest('Please upload an Excel file with .xlsx or .xls extension.');

  let rows: ParsedCandidateRow[];
  try {
    rows = parseCandidateFile(req.file.buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to read the Excel workbook.';
    throw ApiError.badRequest(message);
  }

  const result = {
    successful: 0,
    failed: [] as Array<{ row: number; uid: string; reason: string }>,
    duplicateUids: [] as string[],
    invalidMobiles: [] as string[],
  };

  const existing = await Candidate.find({ uid: { $in: rows.map((r) => r.uid) } }).select('uid').lean();
  const existingSet = new Set(existing.map((c) => c.uid));
  const seen = new Set<string>();

  for (const row of rows) {
    const issues: string[] = [];
    if (seen.has(row.uid)) issues.push('Duplicate UID in file');
    seen.add(row.uid);
    if (existingSet.has(row.uid)) issues.push('UID already exists in the database');
    if (!isValidCandidateUid(row.uid)) issues.push('Invalid UID format. Expected SWAP2K26 followed by 4 digits.');
    if (!row.name) issues.push('Name is missing');
    if (!row.mobile) {
      issues.push('Mobile is missing');
    } else if (!/^[6-9]\d{9}$/.test(row.mobile)) {
      issues.push('Invalid mobile number');
    }

    if (issues.length) {
      if (issues.some((i) => i.includes('Duplicate') || i.includes('already exists'))) result.duplicateUids.push(row.uid);
      if (issues.some((i) => i.includes('Invalid mobile') || i.includes('Mobile is missing'))) result.invalidMobiles.push(row.mobile);
      result.failed.push({ row: row.row, uid: row.uid, reason: issues.join('; ') });
      continue;
    }

    const defaultPassword = generateCandidatePassword(row.uid);
    await Candidate.create({
      uid: row.uid,
      name: row.name,
      mobile: row.mobile,
      college: row.college,
      department: row.department,
      passwordHash: await hashCandidatePassword(defaultPassword),
      active: true,
    });
    result.successful += 1;
  }

  ok(res, result, 'Candidate import processed.');
});

export const getCandidate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid candidate id.');
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found.');
  ok(res, candidate.toJSON());
});

export const updateCandidate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid candidate id.');
  const input = req.body as UpdateCandidateInput;
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found.');

  if (input.name !== undefined) candidate.name = input.name;
  if (input.mobile !== undefined) candidate.mobile = input.mobile;
  if (input.college !== undefined) candidate.college = input.college;
  if (input.department !== undefined) candidate.department = input.department;
  if (input.active !== undefined) candidate.active = input.active;
  await candidate.save();
  ok(res, candidate.toJSON(), 'Candidate updated.');
});

export const resetCandidatePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid candidate id.');
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found.');
  const defaultPassword = generateCandidatePassword(candidate.uid);
  candidate.passwordHash = await hashCandidatePassword(defaultPassword);
  await candidate.save();
  ok(res, { defaultPassword }, 'Password reset successfully.');
});

export const deleteCandidate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid candidate id.');
  const candidate = await Candidate.findByIdAndDelete(id);
  if (!candidate) throw ApiError.notFound('Candidate not found.');
  await ExamAttempt.deleteMany({ candidate: id });
  ok(res, null, 'Candidate and related data deleted.');
});

export const resetCandidateList = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const activeCount = await ExamAttempt.countDocuments({ status: 'ACTIVE' });
  if (activeCount > 0) {
    throw ApiError.badRequest(
      'Candidate list cannot be reset while an examination is active.',
    );
  }
  const result = await Candidate.deleteMany({});
  ok(res, { deleted: result.deletedCount }, 'Candidate list reset successfully.');
});
export const listQuestions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = req.query as unknown as ListQuery;
  const { search } = query;
  const { skip, limit, page } = pagination(query);
  const filter: Record<string, unknown> = {};
  if (search && search.trim()) {
    filter.question = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }
  const [questions, total] = await Promise.all([
    Question.find(filter).sort({ questionNumber: 1 }).skip(skip).limit(limit).select('+correctAnswer').lean(),
    Question.countDocuments(filter),
  ]);
  const activeCount = await Question.countDocuments({ active: true });
  ok(res, { questions, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), activeCount });
});

export const createQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = req.body as CreateQuestionInput;
  const exists = await Question.findOne({ questionNumber: input.questionNumber });
  if (exists) throw ApiError.conflict('A question with this question number already exists.');
  const question = await Question.create(input);
  ok(res, question.toJSON(), 'Question created.');
});

export const updateQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid question id.');
  const input = req.body as Partial<CreateQuestionInput>;
  const question = await Question.findById(id);
  if (!question) throw ApiError.notFound('Question not found.');
  if (input.questionNumber !== undefined) question.questionNumber = input.questionNumber;
  if (input.question !== undefined) question.question = input.question;
  if (input.options) {
    question.options = { ...question.options, ...input.options };
  }
  if (input.correctAnswer !== undefined) question.correctAnswer = input.correctAnswer;
  if (input.marks !== undefined) question.marks = input.marks;
  if (input.active !== undefined) question.active = input.active;
  await question.save();
  ok(res, question.toJSON(), 'Question updated.');
});

export const deleteQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid question id.');
  const question = await Question.findByIdAndDelete(id);
  if (!question) throw ApiError.notFound('Question not found.');
  ok(res, null, 'Question deleted.');
});

export const importQuestions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No Excel file was received by the server.');
  if (!isSpreadsheetFile(req.file)) throw ApiError.badRequest('Please upload an Excel file with .xlsx or .xls extension.');
  const excelFile = req.file;

  let parsed: QuestionImportResult;
  try {
    parsed = parseQuestionFile(excelFile.buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read the Excel file.';
    throw ApiError.badRequest(message);
  }

  if (parsed.validRows.length === 0) {
    throw ApiError.badRequest('Question import validation failed.', parsed.rows.slice(0, 50));
  }

  const activeCount = await ExamAttempt.countDocuments({ status: 'ACTIVE' });
  if (activeCount > 0) {
    throw ApiError.badRequest(
      `Questions cannot be replaced while an examination is currently active (${activeCount} active attempt(s)).`,
    );
  }

  const outcome = await persistQuestionImport(parsed);
  const formatLabel = parsed.format === 'legacy-ipl' ? 'legacy IPL format' : 'new format';
  const message =
    outcome.rejected === 0
      ? `Detected ${formatLabel}; ${outcome.imported} question(s) imported successfully.`
      : `Detected ${formatLabel}; ${parsed.totalRows} row(s) detected, ${outcome.rejected} row(s) failed validation, ${outcome.imported} question(s) imported.`;

  ok(res, {
    totalRows: parsed.totalRows,
    imported: outcome.imported,
    rejected: outcome.rejected,
    format: parsed.format,
    warnings: parsed.warnings,
    replacedExisting: outcome.replacedExisting,
    duplicateQuestionNumbers: parsed.duplicateQuestionNumbers,
    rows: parsed.rows.slice(0, 50),
  }, message);
});

export const resetQuestionList = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const activeCount = await ExamAttempt.countDocuments({ status: 'ACTIVE' });
  if (activeCount > 0) {
    throw ApiError.badRequest(
      'Question list cannot be reset while an examination is active.',
    );
  }
  const result = await Question.deleteMany({});
  ok(res, { deleted: result.deletedCount }, 'Question list reset successfully.');
});

export const resetResultList = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const activeCount = await ExamAttempt.countDocuments({ status: 'ACTIVE' });
  if (activeCount > 0) {
    throw ApiError.badRequest('Results cannot be reset while an examination is active.');
  }
  const result = await ExamAttempt.updateMany(
    { status: { $in: [...FINALIZED_STATUSES] } },
    {
      $set: {
        resultCleared: true,
        rawScore: 0,
        finalScore: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        unanswered: 0,
        durationUsed: 0,
        submittedAt: null,
      },
    },
  );
  ok(res, { cleared: result.modifiedCount }, 'Result list reset successfully.');
});
export const listResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = req.query as unknown as ListQuery;
  const { search, status } = query;
  const { skip, limit, page } = pagination(query);
  const sortKey = (['default', 'score_desc', 'score_asc', 'time_asc', 'time_desc'].includes(query.sort ?? '')
    ? query.sort
    : 'default') as ResultSortKey;

  const attemptFilter: Record<string, unknown> = { status: { $in: [...FINALIZED_STATUSES] }, resultCleared: { $ne: true } };
  if (status) attemptFilter.status = status;

  if (search && search.trim()) {
    const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const candidates = await Candidate.find({
      $or: [
        { uid: { $regex: safe, $options: 'i' } },
        { name: { $regex: safe, $options: 'i' } },
        { mobile: { $regex: safe, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();
    attemptFilter.candidate = { $in: candidates.map((c) => c._id) };
  }

  const attempts = await ExamAttempt.find(attemptFilter).sort({ submittedAt: -1, createdAt: -1 }).lean();
  const finalAttempts = latestAttemptPerCandidate(attempts.map(toFinalAttempt));

  const eligible = finalAttempts.filter(isRankable).sort(byScoreThenTime);
  const rankByAttempt = computeRanks(eligible);

  const ordered = sortFinalAttempts(finalAttempts, sortKey);
  const total = ordered.length;
  const pageRows = ordered.slice(skip, skip + limit);

  const candidates = await Candidate.find({ _id: { $in: pageRows.map((a) => a.candidate) } }).lean();
  const byCandidate = new Map(candidates.map((c) => [String(c._id), c]));

  const data = pageRows.map((a) => {
    const c = byCandidate.get(a.candidate);
    return {
      attemptId: a.attemptId,
      rank: rankByAttempt.get(a.attemptId) ?? null,
      uid: c?.uid ?? 'UNKNOWN',
      name: c?.name ?? 'Unknown',
      mobile: c?.mobile ?? '-',
      correct: a.correct,
      wrong: a.wrong,
      unanswered: a.unanswered,
      rawScore: a.rawScore,
      finalScore: a.finalScore,
      violationCount: a.violationCount,
      malpracticeStatus: a.malpracticeStatus,
      status: a.status,
      startedAt: a.startedAt ?? null,
      submittedAt: a.submittedAt ?? null,
      durationUsed: a.durationUsed,
    };
  });

  const [totalRegistered, attendedIds, settings] = await Promise.all([
    Candidate.countDocuments(),
    ExamAttempt.distinct('candidate', { resultCleared: { $ne: true } }),
    getSettings(),
  ]);
  const topScoreMax = settings.totalQuestions * settings.marksPerCorrect;

  ok(res, {
    results: data,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    summary: {
      totalRegistered,
      attended: attendedIds.length,
      submitted: finalAttempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'TIMED_OUT').length,
      topScore: eligible.length > 0 ? eligible[0].finalScore : 0,
      topScoreMax,
    },
  });
});

export const exportResults = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const attempts = await ExamAttempt.find({
    status: { $in: [...FINALIZED_STATUSES] },
    resultCleared: { $ne: true },
  })
    .sort({ submittedAt: -1, createdAt: -1 })
    .lean();
  const finalAttempts = latestAttemptPerCandidate(attempts.map(toFinalAttempt));

  const eligible = finalAttempts.filter(isRankable).sort(byScoreThenTime);
  const rankByAttempt = computeRanks(eligible);
  const ordered = sortFinalAttempts(finalAttempts, 'default');

  const candidates = await Candidate.find({ _id: { $in: ordered.map((a) => a.candidate) } }).lean();
  const byCandidate = new Map(candidates.map((c) => [String(c._id), c]));

  const rows = ordered.map((a) => {
    const c = byCandidate.get(a.candidate);
    const rank = rankByAttempt.get(a.attemptId);
    return {
      Rank: rank ? `#${rank}` : '-',
      UID: c?.uid ?? '-',
      Name: c?.name ?? '-',
      Mobile: c?.mobile ?? '-',
      Correct: a.correct,
      Wrong: a.wrong,
      Unanswered: a.unanswered,
      'Raw Score': a.rawScore,
      'Final Score': a.finalScore,
      Violations: a.violationCount,
      'Malpractice Status': a.malpracticeStatus,
      'Exam Status': a.status,
      'Started At': a.startedAt ? new Date(a.startedAt).toISOString() : '-',
      'Submitted At': a.submittedAt ? new Date(a.submittedAt).toISOString() : '-',
      Duration: formatDuration(a.durationUsed),
      'Duration (sec)': a.durationUsed,
    };
  });

  const buffer = exportResultsToExcel(rows);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="swap2k26-results.xlsx"');
  res.send(buffer);
});
export const listMalpractice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { skip, limit, page } = pagination(req.query as unknown as ListQuery);
  const logs = await MalpracticeLog.find()
    .populate('candidate', 'uid name mobile')
    .populate('attempt', 'minorViolationCount status malpracticeStatus')
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  const total = await MalpracticeLog.countDocuments();
  ok(res, { logs, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

export const updateMalpractice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const attemptId = String(req.params.attemptId);
  const { action } = req.body as { action: 'CONFIRM' | 'CLEAR' | 'TERMINATE' };
  if (!isValidObjectId(attemptId)) throw ApiError.badRequest('Invalid attempt id.');
  const attempt = await ExamAttempt.findById(attemptId);
  if (!attempt) throw ApiError.notFound('Attempt not found.');

  if (action === 'CONFIRM') {
    attempt.malpracticeStatus = 'CONFIRMED';
    attempt.finalScore = 0;
  } else if (action === 'CLEAR') {
    attempt.malpracticeStatus = 'NORMAL';
    attempt.finalScore = finalScoreFrom(attempt.rawScore, 'NORMAL');
  } else if (action === 'TERMINATE') {
    if (attempt.status === 'ACTIVE') {
      attempt.status = 'TERMINATED';
      attempt.submittedAt = new Date();
      attempt.malpracticeStatus = 'TERMINATED';
      attempt.finalScore = 0;
    } else {
      attempt.malpracticeStatus = 'TERMINATED';
      attempt.finalScore = 0;
    }
  }
  await attempt.save();

  ok(res, { malpracticeStatus: attempt.malpracticeStatus, finalScore: attempt.finalScore }, 'Malpractice updated.');
});

export const resetMalpracticeList = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const logResult = await MalpracticeLog.deleteMany({});
  await ExamAttempt.updateMany({}, { $set: { violationCount: 0, malpracticeStatus: 'NORMAL' } });
  ok(res, { deleted: logResult.deletedCount }, 'Malpractice list reset successfully.');
});

export const getSettingsHandler = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const settings = await getSettings();
  ok(res, settings.toJSON());
});

export const updateSettingsHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = req.body as SettingsInput;
  const settings = await getSettings();
  const activeCount = await ExamAttempt.countDocuments({ status: 'ACTIVE' });
  if (activeCount > 0) {
    throw ApiError.badRequest(
      `${activeCount} candidate(s) are currently writing the exam. To avoid disruption, core settings cannot be changed now. Wait until the exam completes or terminate active sessions.`,
    );
  }
  if (input.examTitle !== undefined) settings.examTitle = input.examTitle;
  if (input.durationMinutes !== undefined) settings.durationMinutes = input.durationMinutes;
  if (input.totalQuestions !== undefined) settings.totalQuestions = input.totalQuestions;
  if (input.marksPerCorrect !== undefined) settings.marksPerCorrect = input.marksPerCorrect;
  if (input.maxViolations !== undefined) settings.maxViolations = input.maxViolations;
  if (input.autoTerminateEnabled !== undefined) settings.autoTerminateEnabled = input.autoTerminateEnabled;
  if (input.fullscreenRequired !== undefined) settings.fullscreenRequired = input.fullscreenRequired;
  if (input.examEnabled !== undefined) settings.examEnabled = input.examEnabled;
  await settings.save();
  ok(res, settings.toJSON(), 'Settings updated.');
});

export const liveStatus = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const attempts = await ExamAttempt.find({ status: 'ACTIVE' })
    .populate('candidate', 'uid name mobile')
    .sort({ startedAt: -1 })
    .lean();
  const now = Date.now();
  const data = attempts
    .map((a) => {
      const candidate = a.candidate as unknown as { uid?: string; name?: string; mobile?: string };
      const remaining = Math.max(0, Math.floor((new Date(a.expiresAt).getTime() - now) / 1000));
      return {
        attemptId: a._id,
        uid: candidate?.uid ?? '-',
        name: candidate?.name ?? '-',
        mobile: candidate?.mobile ?? '-',
        startedAt: a.startedAt,
        remainingSeconds: remaining,
        answeredCount: a.answeredCount,
        violationCount: a.violationCount,
        malpracticeStatus: a.malpracticeStatus,
        status: 'ACTIVE',
      };
    })
    .filter((d) => d.remainingSeconds > 0);
  ok(res, { live: data, count: data.length });
});