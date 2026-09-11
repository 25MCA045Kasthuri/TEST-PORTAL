import { z } from 'zod';
import { MOBILE_REGEX, UID_REGEX } from './authValidators';

export const ADMIN_OPTIONS = ['A', 'B', 'C', 'D'] as const;
const OPTION_ENUM = { A: 'A', B: 'B', C: 'C', D: 'D' } as const;
const ACTION_ENUM = { CONFIRM: 'CONFIRM', CLEAR: 'CLEAR', TERMINATE: 'TERMINATE' } as const;

export const createCandidateSchema = z.object({
  uid: z.string().trim().regex(UID_REGEX, 'UID must be SWAP2K26 followed by 4 digits.'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(120),
  mobile: z.string().trim().regex(MOBILE_REGEX, 'Enter a valid 10-digit mobile number.'),
  college: z.string().trim().max(200).optional().or(z.literal('')),
  department: z.string().trim().max(120).optional().or(z.literal('')),
});

export const updateCandidateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    mobile: z.string().trim().regex(MOBILE_REGEX, 'Enter a valid mobile number.').optional(),
    college: z.string().trim().max(200).optional().or(z.literal('')),
    department: z.string().trim().max(120).optional().or(z.literal('')),
    active: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update.' });

export const createQuestionSchema = z.object({
  questionNumber: z.number().int().min(1),
  question: z.string().trim().min(1, 'Question text is required.').max(2000),
  options: z.object({
    A: z.string().trim().min(1, 'Option A is required.'),
    B: z.string().trim().min(1, 'Option B is required.'),
    C: z.string().trim().min(1, 'Option C is required.'),
    D: z.string().trim().min(1, 'Option D is required.'),
  }),
  correctAnswer: z.enum(OPTION_ENUM),
  marks: z.number().min(0).max(100).optional().default(1),
  active: z.boolean().optional().default(true),
});

export const updateQuestionSchema = createQuestionSchema.partial();

export const settingsSchema = z.object({
  examTitle: z.string().trim().min(1).max(200).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  totalQuestions: z.number().int().min(1).max(500).optional(),
  marksPerCorrect: z.number().min(0).max(100).optional(),
  maxViolations: z.number().int().min(1).max(20).optional(),
  autoTerminateEnabled: z.boolean().optional(),
  fullscreenRequired: z.boolean().optional(),
  examEnabled: z.boolean().optional(),
});

export const malpracticeUpdateSchema = z.object({
  action: z.enum(ACTION_ENUM),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;