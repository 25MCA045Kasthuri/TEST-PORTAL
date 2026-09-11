import type {
  AdminCandidate,
  AdminQuestion,
  AppSettings,
  CandidateImportResult,
  CandidateListResponse,
  DashboardData,
  LiveResponse,
  MalpracticeListResponse,
  OptionKey,
  QuestionImportResult,
  QuestionListResponse,
  ResultsResponse,
} from '../types';
import { api } from './api';

export const getDashboard = () => api.get('/admin/dashboard').then((r) => r.data.data as DashboardData);

export const listCandidates = (params: { search?: string; page?: number; limit?: number }) =>
  api.get('/admin/candidates', { params }).then((r) => r.data.data as CandidateListResponse);

export const createCandidate = (payload: {
  uid: string;
  name: string;
  mobile: string;
  college?: string;
  department?: string;
}) => api.post('/admin/candidates', payload).then((r) => r.data.data as AdminCandidate & { defaultPassword?: string });

export const updateCandidate = (
  id: string,
  payload: { name?: string; mobile?: string; college?: string; department?: string; active?: boolean },
) => api.put(`/admin/candidates/${id}`, payload).then((r) => r.data.data as AdminCandidate);

export const resetCandidatePassword = (id: string) =>
  api.post(`/admin/candidates/${id}/reset-password`).then((r) => r.data.data as { defaultPassword?: string } | null);

export const deleteCandidate = (id: string) => api.delete(`/admin/candidates/${id}`).then((r) => r.data);

export const importCandidates = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/admin/candidates/import', form).then((r) => r.data.data as CandidateImportResult);
};

export const resetCandidateList = () =>
  api.delete('/admin/candidates/reset').then((r) => r.data.data as { deleted: number } | null);

export const listQuestions = (params: { search?: string; page?: number; limit?: number }) =>
  api.get('/admin/questions', { params }).then((r) => r.data.data as QuestionListResponse);

export const createQuestion = (payload: {
  questionNumber: number;
  question: string;
  options: Record<OptionKey, string>;
  correctAnswer: OptionKey;
  marks?: number;
  active?: boolean;
}) => api.post('/admin/questions', payload).then((r) => r.data.data as AdminQuestion);

export const updateQuestion = (id: string, payload: Partial<Parameters<typeof createQuestion>[0]>) =>
  api.put(`/admin/questions/${id}`, payload).then((r) => r.data.data as AdminQuestion);

export const deleteQuestion = (id: string) => api.delete(`/admin/questions/${id}`).then((r) => r.data);

export const importQuestions = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/admin/questions/import', form).then((r) => r.data.data as QuestionImportResult);
};

export const resetQuestionList = () =>
  api.delete('/admin/questions/reset').then((r) => r.data.data as { deleted: number } | null);

export type ResultsSortKey = 'default' | 'score_desc' | 'score_asc' | 'time_asc' | 'time_desc';

export const listResults = (params: { search?: string; status?: string; sort?: ResultsSortKey; page?: number; limit?: number }) =>
  api.get('/admin/results', { params }).then((r) => r.data.data as ResultsResponse);

export const exportResultsUrl = '/api/admin/results/export';

export const listMalpractice = (params: { page?: number; limit?: number }) =>
  api.get('/admin/malpractice', { params }).then((r) => r.data.data as MalpracticeListResponse);

export const updateMalpractice = (attemptId: string, action: 'CONFIRM' | 'CLEAR' | 'TERMINATE') =>
  api.put(`/admin/malpractice/${attemptId}`, { action }).then((r) => r.data);

export const resetMalpracticeList = () =>
  api.delete('/admin/malpractice/reset').then((r) => r.data.data as { deleted: number } | null);

export const getSettings = () => api.get('/admin/settings').then((r) => r.data.data as AppSettings);

export const updateSettings = (payload: Partial<AppSettings>) =>
  api.put('/admin/settings', payload).then((r) => r.data.data as AppSettings);

export const getLiveStatus = () => api.get('/admin/live').then((r) => r.data.data as LiveResponse);