import dotenv from 'dotenv';
import path from 'path';

// override: true → values in .env take precedence over any pre-existing shell exports,
// so this file is the single source of truth for configuration.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 5000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/swap2k26',
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  cookieName: process.env.COOKIE_NAME ?? 'swap2k26_token',
  tokenTtlHours: Number(process.env.TOKEN_TTL_HOURS ?? 6),
  adminEmail: process.env.ADMIN_EMAIL ?? '',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
};
