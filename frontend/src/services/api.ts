import axios, { AxiosError } from 'axios';
import type { ApiEnvelope } from '../types';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export interface ApiFailure extends Error {
  status?: number;
  details?: unknown;
}

export function toApiFailure(err: unknown): ApiFailure {
  if (err instanceof AxiosError) {
    const body = err.response?.data as Partial<ApiEnvelope<unknown>> | undefined;
    const failure: ApiFailure = new Error(body?.message || err.message || 'Request failed');
    failure.status = err.response?.status;
    failure.details = body?.details;
    return failure;
  }
  if (err instanceof Error) return err;
  return new Error('Unexpected error');
}

/** Extract per-field error details when the backend sends Zod issues. */
export function fieldErrors(err: unknown): Record<string, string> {
  const failure = toApiFailure(err);
  const details = failure.details;
  const out: Record<string, string> = {};
  if (Array.isArray(details)) {
    for (const item of details) {
      const issue = item as { path?: string[]; message?: string };
      const key = issue.path?.join('.') ?? '_';
      if (!out[key]) out[key] = issue.message ?? 'Invalid value';
    }
  }
  return out;
}