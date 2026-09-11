import { Request, Response, NextFunction, RequestHandler } from 'express';
import { signToken, verifyToken, TokenPayload } from '../services/tokenService';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

export function setAuthCookie(res: Response, payload: TokenPayload): string {
  const token = signToken(payload);
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    maxAge: env.tokenTtlHours * 60 * 60 * 1000,
    path: '/',
  });
  return token;
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(env.cookieName, { path: '/' });
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies[env.cookieName]) return req.cookies[env.cookieName];
  return null;
}

function authenticate(req: Request): void {
  const token = readToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required.');
  const payload = verifyToken(token);
  if (!payload) throw ApiError.unauthorized('Your session has expired. Please log in again.');
  req.auth = payload;
}

export const requireCandidate: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  try {
    authenticate(req);
    if (req.auth!.role !== 'candidate') throw ApiError.forbidden('Candidate access required.');
    next();
  } catch (err) {
    next(err);
  }
};

/** Authenticates the request without enforcing a role. */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  try {
    authenticate(req);
    next();
  } catch (err) {
    next(err);
  }
};

export const requireAdmin: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  try {
    authenticate(req);
    if (req.auth!.role !== 'admin') throw ApiError.forbidden('Administrator access required.');
    next();
  } catch (err) {
    next(err);
  }
};