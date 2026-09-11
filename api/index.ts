// @ts-nocheck
// Vercel serverless entrypoint.
// Wraps the existing Express app (built from backend/src) as a single fluid-compute
// function: lazily connects MongoDB on the first request, then hands off to Express.
// Bootstraps the admin account once per warm instance via the backend's own script
// (keeps the connection open so the function can reuse it).
import { createApp } from '../backend/dist/app';
import { connectDatabase } from '../backend/dist/config/db';
import { ensureAdmin } from '../backend/dist/scripts/ensureAdmin';

export const config = { maxDuration: 60 };

let app = null;
let connectPromise = null;
let adminEnsured = false;

async function ensureReady() {
  if (!connectPromise) {
    connectPromise = connectDatabase().catch((err) => {
      connectPromise = null;
      throw err;
    });
    app = createApp();
  }
  await connectPromise;

  if (!adminEnsured) {
    adminEnsured = true;
    try {
      await ensureAdmin(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[vercel] ensureAdmin failed', err);
    }
  }
}

export default async function handler(req, res) {
  try {
    await ensureReady();
  } catch {
    res.status(503).json({ success: false, message: 'Database unavailable. Please try again.' });
    return;
  }
  app(req, res);
}