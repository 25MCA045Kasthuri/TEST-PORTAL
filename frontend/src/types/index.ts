export type Role = 'admin' | 'candidate';

export type ExamState = 'NOT_STARTED' | 'ACTIVE' | 'SUBMITTED' | 'TIMED_OUT' | 'TERMINATED';

export type OptionKey = 'A' | 'B' | 'C' | 'D';

export type MalpracticeStatus =
  | 'NORMAL'
  | 'WARNING'
  | 'SUSPECTED'
  | 'CONFIRMED'
  | 'TERMINATED';

export type MalpracticeEvent =
  | 'TAB_SWITCH'
  | 'WINDOW_BLUR'
  | 'FULLSCREEN_EXIT'
  | 'COPY_ATTEMPT'
  | 'PASTE_ATTEMPT'
  | 'CUT_ATTEMPT'
  | 'CONTEXT_MENU_ATTEMPT'
  | 'SHORTCUT_ATTEMPT'
  | 'MULTIPLE_LOGIN_ATTEMPT';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  details?: unknown;
}

export interface Me {
  role: Role;
  name?: string;
  email?: string;
  uid?: string;
  mobile?: string;
  college?: string;
  department?: string;
}

export interface ExamStatus {
  state: ExamState;
  examEnabled: boolean;
  examTitle: string;
  fullScreenRequired: boolean;
  durationMinutes: number;
  remainingSeconds: number;
  attempt: AttemptDto | null;
}

export interface AttemptAnswer {
  question: string;
  questionNumber: number;
  selectedAnswer: OptionKey | null;
  markedForReview: boolean;
}

export interface AttemptDto {
  attemptId: string;
  sessionId: string;
  status: ExamState;
  startedAt: string;
  expiresAt: string;
  remainingSeconds: number;
  answeredCount: number;
  violationCount: number;
  minorViolationCount?: number;
  malpracticeStatus: MalpracticeStatus;
  lastQuestionNumber: number;
  submittedAt: string | null;
  answers: AttemptAnswer[];
  rawScore?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  unanswered?: number;
}

export interface CandidateQuestion {
  _id: string;
  questionNumber: number;
  question: string;
  options: Record<OptionKey, string>;
  marks: number;
}

export interface QuestionsResponse {
  totalQuestions: number;
  questions: CandidateQuestion[];
}

export interface ViolationResponse {
  acknowledged: boolean;
  status?: string;
  violationCount?: number;
  minorViolationCount?: number;
  malpracticeStatus?: MalpracticeStatus;
  terminated?: boolean;
  terminate?: boolean;
  applied?: boolean;
  message?: string;
}

export interface DashboardData {
  registeredCandidates: number;
  notStarted: number;
  currentlyWriting: number;
  completed: number;
  malpracticeFlags: number;
  terminatedSessions: number;
  activeQuestionCount: number;
  settings: {
    examTitle: string;
    durationMinutes: number;
    totalQuestions: number;
    examEnabled: boolean;
  };
}

export interface AdminCandidate {
  _id: string;
  uid: string;
  name: string;
  mobile: string;
  college: string;
  department: string;
  active: boolean;
  examStatus: ExamState | 'NOT_STARTED';
  malpracticeStatus: MalpracticeStatus;
  rawScore: number | null;
  finalScore: number | null;
}

export interface Paginated<T = unknown> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  rows?: T[];
}

export interface CandidateListResponse extends Paginated<AdminCandidate> {
  candidates: AdminCandidate[];
}

export interface AdminQuestion {
  _id: string;
  questionNumber: number;
  question: string;
  options: Record<OptionKey, string>;
  correctAnswer: OptionKey;
  marks: number;
  active: boolean;
}

export interface QuestionListResponse extends Paginated<AdminQuestion> {
  questions: AdminQuestion[];
  activeCount: number;
}

export interface ImportRow {
  row: number;
  uid?: string;
  questionNumber?: number;
  reason: string;
}

export interface CandidateImportResult {
  successful: number;
  failed: ImportRow[];
  duplicateUids: string[];
  invalidMobiles: string[];
}

export interface QuestionImportResult {
  totalRows: number;
  imported: number;
  rejected: number;
  format?: 'new' | 'legacy-ipl';
  warnings: Array<{ row: number; questionNumber: number | string; message: string }>;
  replacedExisting: boolean;
  duplicateQuestionNumbers: string[];
  rows: Array<{ row: number; questionNumber: number; reason: string }>;
}

export interface ResultRow {
  attemptId: string;
  rank: number | null;
  uid: string;
  name: string;
  mobile: string;
  correct: number;
  wrong: number;
  unanswered: number;
  rawScore: number;
  finalScore: number;
  violationCount: number;
  malpracticeStatus: MalpracticeStatus;
  status: ExamState;
  startedAt: string | null;
  submittedAt: string | null;
  durationUsed: number;
}

export interface ResultsSummary {
  totalRegistered: number;
  attended: number;
  submitted: number;
  topScore: number;
  topScoreMax?: number;
}

export interface ResultsResponse extends Paginated<ResultRow> {
  results: ResultRow[];
  summary: ResultsSummary;
}

export interface MalpracticeLogRow {
  _id: string;
  candidate: { _id: string; uid: string; name: string; mobile: string };
  attempt?: {
    _id: string;
    minorViolationCount?: number;
    status?: ExamState;
    malpracticeStatus?: MalpracticeStatus;
  } | null;
  eventType: MalpracticeEvent;
  questionNumber: number | null;
  severity: 'MAJOR' | 'MINOR';
  userAgent: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface MalpracticeListResponse extends Paginated<MalpracticeLogRow> {
  logs: MalpracticeLogRow[];
}

export interface AppSettings {
  _id?: string;
  examTitle: string;
  durationMinutes: number;
  totalQuestions: number;
  marksPerCorrect: number;
  maxViolations: number;
  autoTerminateEnabled: boolean;
  fullscreenRequired: boolean;
  examEnabled: boolean;
  updatedAt?: string;
}

export interface LiveRow {
  attemptId: string;
  uid: string;
  name: string;
  mobile: string;
  startedAt: string;
  remainingSeconds: number;
  answeredCount: number;
  violationCount: number;
  malpracticeStatus: MalpracticeStatus;
  status: 'ACTIVE';
}

export interface LiveResponse {
  live: LiveRow[];
  count: number;
}