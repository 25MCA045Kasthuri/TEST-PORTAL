import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound('Endpoint not found.'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  let status = 500;
  let message = 'Something went wrong. Please try again.';
  let code = 'INTERNAL_ERROR';
  let details: unknown;

  if (err instanceof ApiError) {
    status = err.status;
    message = err.message;
    code = err.code ?? 'ERROR';
    details = err.details;
  } else if (err instanceof Error && err.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed.';
    code = 'VALIDATION_ERROR';
    details = err.message;
  } else if (err instanceof Error && (err as { code?: number }).code === 11000) {
    status = 409;
    message = 'Duplicate value. Record already exists.';
    code = 'DUPLICATE';
  } else if (err instanceof MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file is too large (maximum 5 MB).' : 'Upload could not be processed.';
    code = 'UPLOAD_ERROR';
  }

  if (env.nodeEnv !== 'test') {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }

  const body: Record<string, unknown> = { success: false, message, code };
  if (env.nodeEnv !== 'production' && err instanceof Error) {
    body.details = details ?? err.message;
  }
  res.status(status).json(body);
}