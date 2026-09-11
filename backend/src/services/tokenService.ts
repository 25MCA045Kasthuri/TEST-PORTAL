import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Types } from 'mongoose';

export type Role = 'candidate' | 'admin';

export interface TokenPayload {
  sub: string;
  role: Role;
  name?: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: `${env.tokenTtlHours}h` });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}