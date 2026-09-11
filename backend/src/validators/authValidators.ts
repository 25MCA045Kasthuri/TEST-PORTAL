import { z } from 'zod';
import { normalizeUid, CANDIDATE_UID_REGEX } from '../services/candidatePassword';

export const UID_REGEX = CANDIDATE_UID_REGEX;
export const MOBILE_REGEX = /^[6-9]\d{9}$/;

export { normalizeUid };

export const candidateLoginSchema = z.object({
  uid: z
    .string({ message: 'UID is required.' })
    .trim()
    .regex(UID_REGEX, 'UID must be in the format SWAP2K26 followed by 4 digits (e.g. SWAP2K260001).'),
  password: z.string({ message: 'Password is required.' }).min(1, 'Password is required.'),
});

export const adminLoginSchema = z.object({
  email: z.string({ message: 'Email is required.' }).trim().email('Enter a valid email address.'),
  password: z.string({ message: 'Password is required.' }).min(1, 'Password is required.'),
});

export type CandidateLoginInput = z.infer<typeof candidateLoginSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;