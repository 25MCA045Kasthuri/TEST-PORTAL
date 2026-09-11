import bcrypt from 'bcryptjs';

/**
 * Candidate default password utility.
 *
 * A candidate's default password is derived from their UID:
 *
 *   Password = "Jmc" + last 4 digits of UID
 *
 * Example: SWAP2K260001 -> Jmc0001
 *
 * Only the bcrypt hash is ever stored. Neither the plaintext password nor the
 * hash is logged or returned by the API.
 */

export const PASSWORD_PREFIX = 'Jmc';
export const CANDIDATE_UID_REGEX = /^SWAP2K26\d{4}$/i;
export const PASSWORD_BCRYPT_ROUNDS = 12;

export function normalizeUid(uid: string): string {
  return uid.trim().toUpperCase();
}

export function isValidCandidateUid(uid: string): boolean {
  return CANDIDATE_UID_REGEX.test(normalizeUid(uid));
}

/**
 * Returns the default password for a candidate UID.
 * @throws {Error} when the UID is not in the expected SWAP2K26 + 4 digits format.
 */
export function generateCandidatePassword(uid: string): string {
  const normalized = normalizeUid(uid);
  if (!CANDIDATE_UID_REGEX.test(normalized)) {
    throw new Error('Invalid UID format. Expected SWAP2K26 followed by 4 digits.');
  }
  return `${PASSWORD_PREFIX}${normalized.slice(-4)}`;
}

export async function hashCandidatePassword(password: string): Promise<string> {
  const rounds = Number(process.env.PASSWORD_BCRYPT_ROUNDS) || PASSWORD_BCRYPT_ROUNDS;
  return bcrypt.hash(password, rounds);
}

export async function verifyCandidatePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}