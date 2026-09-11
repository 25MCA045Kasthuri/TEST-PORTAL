import type {
  AttemptDto,
  CandidateQuestion,
  ExamStatus,
  MalpracticeEvent,
  Me,
  OptionKey,
  QuestionsResponse,
  ViolationResponse,
} from '../types';
import { api } from './api';

/* ── Auth ─────────────────────────────────────────────── */
export const getMe = () => api.get<{ data: Me }>('/auth/me').then((r) => r.data.data);
export const candidateLogin = (uid: string, password: string) =>
  api.post('/auth/candidate/login', { uid, password }).then((r) => r.data);
export const adminLogin = (email: string, password: string) =>
  api.post('/auth/admin/login', { email, password }).then((r) => r.data);
export const logout = () => api.post('/auth/logout');

/* ── Exam ─────────────────────────────────────────────── */
export const getExamStatus = () =>
  api.get<ExamStatus & { data: ExamStatus }>('/exam/status').then((r) => r.data.data as unknown as ExamStatus);

export const startExam = () => api.post('/exam/start').then((r) => r.data.data as AttemptDto);
export const fetchQuestions = () =>
  api.get('/exam/questions').then((r) => r.data.data as QuestionsResponse);
export const fetchAttempt = (sessionId?: string) =>
  api.get('/exam/attempt', { params: sessionId ? { sessionId } : undefined }).then((r) => r.data.data as AttemptDto);
export const saveAnswer = (questionId: string, selectedAnswer: OptionKey | null, questionNumber: number, clear = false) =>
  api.put('/exam/answer', { questionId, selectedAnswer, questionNumber, clear }).then((r) => r.data.data);
export const markForReview = (questionId: string, marked: boolean) =>
  api.put('/exam/review', { questionId, marked }).then((r) => r.data.data);
export const savePosition = (questionNumber: number) =>
  api.put('/exam/position', { questionNumber }).then((r) => r.data.data);
export const reportViolation = (
  eventType: MalpracticeEvent,
  questionNumber?: number,
  metadata: Record<string, unknown> = {},
) => api.post('/exam/violation', { eventType, questionNumber, metadata }).then((r) => r.data.data as ViolationResponse);
export const submitExam = () => api.post('/exam/submit', { manual: true }).then((r) => r.data.data as AttemptDto);

export function examStatusTyped(): Promise<ExamStatus> {
  return api.get('/exam/status').then((r) => r.data.data);
}

export { fetchQuestions as getQuestions, saveAnswer as putAnswer, examStatusTyped as fetchExamStatus };
export type { CandidateQuestion };
