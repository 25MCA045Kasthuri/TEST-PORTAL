import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/ApiError';

const AUTH_WINDOW_MS = 15 * 60 * 1000;

export const authLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, _next, options) => {
    throw ApiError.badRequest(`Too many login attempts. Please try again after ${Math.ceil(options.windowMs / 60000)} minutes.`);
  },
});

/**
 * Candidate passwords follow a predictable pattern (Jmc + last 4 digits of UID),
 * so failed candidate logins are rate-limited per IP. Successful logins are not
 * counted, keeping the exam usable even when candidates share a network.
 */
export const candidateLoginLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  limit: Number(process.env.CANDIDATE_LOGIN_RATE_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, _res, _next, options) => {
    throw ApiError.tooManyRequests(
      `Too many failed login attempts. Please try again after ${Math.ceil(options.windowMs / 60000)} minutes.`,
    );
  },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: () => {
    throw ApiError.badRequest('Too many requests. Please slow down.');
  },
});