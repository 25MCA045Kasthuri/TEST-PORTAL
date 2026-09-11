import bcrypt from 'bcryptjs';
import { Admin } from '../models/Admin';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';

/**
 * Creates the admin account from environment variables (ADMIN_EMAIL / ADMIN_PASSWORD)
 * if it does not already exist. Idempotent and safe for production run at boot:
 * an existing admin's password is never overwritten.
 */
export async function ensureAdmin(): Promise<void> {
  if (!env.adminEmail || !env.adminPassword) {
    // eslint-disable-next-line no-console
    console.warn('[ensureAdmin] ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping admin creation.');
    return;
  }
  await connectDatabase();
  try {
    const passwordHash = await bcrypt.hash(env.adminPassword, 12);
    await Admin.updateOne(
      { email: env.adminEmail.toLowerCase() },
      {
        $set: { email: env.adminEmail.toLowerCase(), name: 'Administrator', active: true },
        $setOnInsert: { passwordHash },
      },
      { upsert: true },
    );
    // eslint-disable-next-line no-console
    console.log(`[ensureAdmin] admin ready: ${env.adminEmail}`);
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  ensureAdmin().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[ensureAdmin] failed', err);
    process.exit(1);
  });
}