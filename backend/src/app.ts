import express, { Express } from 'express';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes';
import examRoutes from './routes/examRoutes';
import adminRoutes from './routes/adminRoutes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter, authLimiter } from './middleware/rateLimit';
import { env } from './config/env';

/** Locate the built React app (frontend/dist) regardless of the process cwd. */
function frontendDist(): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, 'frontend', 'dist'),
    path.resolve(cwd, '..', 'frontend', 'dist'),
    path.resolve(cwd, '..', '..', 'frontend', 'dist'),
    path.resolve(__dirname, '..', '..', '..', 'frontend', 'dist'),
  ];
  const existing = candidates.find((p) => fs.existsSync(path.join(p, 'index.html')));
  if (!existing) {
    // eslint-disable-next-line no-console
    console.warn('[app] frontend production build not found; serving API only.');
  }
  return existing ?? candidates[0];
}

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'ok' });
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/exam', apiLimiter, examRoutes);
  app.use('/api/admin', apiLimiter, adminRoutes);

  // In production, serve the built React app from the same origin so cookies + SPA routing just work.
  if (env.isProd) {
    const clientDist = frontendDist();
    if (fs.existsSync(path.join(clientDist, 'index.html'))) {
      app.use(express.static(clientDist));
      app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
        return res.sendFile(path.join(clientDist, 'index.html'));
      });
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}