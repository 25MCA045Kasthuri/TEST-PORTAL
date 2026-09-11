import { Response } from 'express';

export function ok(res: Response, data: unknown, message = 'Success'): void {
  res.status(200).json({ success: true, message, data });
}

export function created(res: Response, data: unknown, message = 'Created'): void {
  res.status(201).json({ success: true, message, data });
}