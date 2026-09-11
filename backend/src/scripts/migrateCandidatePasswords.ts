import { connectDatabase, disconnectDatabase } from '../config/db';
import { Candidate } from '../models/Candidate';
import {
  generateCandidatePassword,
  hashCandidatePassword,
  isValidCandidateUid,
} from '../services/candidatePassword';

/**
 * Safe migration: replaces every candidate's password hash with the bcrypt hash
 * of their UID-derived default password (Jmc + last 4 digits of UID).
 *
 * - Candidate UID, name, mobile, college, department are unchanged.
 * - Exam attempts, results and malpractice data are untouched.
 * - Neither plaintext passwords nor hashes are printed.
 */
export async function migrateCandidatePasswords(): Promise<void> {
  await connectDatabase();

  const candidates = await Candidate.find().select('+passwordHash');
  let processed = 0;
  let updated = 0;
  let failed = 0;

  for (const candidate of candidates) {
    processed += 1;
    const uid = candidate.uid ?? '';
    if (!isValidCandidateUid(uid)) {
      // eslint-disable-next-line no-console
      console.error(`[migration] SKIPPED ${uid} (invalid UID format)`);
      failed += 1;
      continue;
    }
    try {
      const passwordHash = await hashCandidatePassword(generateCandidatePassword(uid));
      await Candidate.updateOne({ _id: candidate._id }, { $set: { passwordHash } });
      updated += 1;
      // eslint-disable-next-line no-console
      console.log(`Updated ${uid}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[migration] FAILED ${uid}: ${(err as Error).message}`);
      failed += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Candidates processed: ${processed}`);
  // eslint-disable-next-line no-console
  console.log(`Candidates updated: ${updated}`);
  // eslint-disable-next-line no-console
  console.log(`Failed: ${failed}`);

  await disconnectDatabase();
}

if (require.main === module) {
  migrateCandidatePasswords().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[migration] failed', err);
    process.exit(1);
  });
}