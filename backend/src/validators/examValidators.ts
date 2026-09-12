import { z } from 'zod';

export const answerSchema = z.object({
  questionId: z.string({ message: 'questionId is required.' }).min(1, 'Invalid question id.'),
  selectedAnswer: z
    .string()
    .refine((v) => v === '' || ['A', 'B', 'C', 'D'].includes(v), 'Answer must be A, B, C, D or empty to clear.'),
  questionNumber: z.number({ message: 'questionNumber is required.' }).int().min(1),
  clear: z.boolean().optional().default(false),
});

const VIOLATION_ENUMS = {
  TAB_SWITCH: 'TAB_SWITCH',
  WINDOW_BLUR: 'WINDOW_BLUR',
  FULLSCREEN_EXIT: 'FULLSCREEN_EXIT',
  COPY_ATTEMPT: 'COPY_ATTEMPT',
  PASTE_ATTEMPT: 'PASTE_ATTEMPT',
  CUT_ATTEMPT: 'CUT_ATTEMPT',
  CONTEXT_MENU_ATTEMPT: 'CONTEXT_MENU_ATTEMPT',
  SHORTCUT_ATTEMPT: 'SHORTCUT_ATTEMPT',
  EXAM_SCREEN_HIDDEN: 'EXAM_SCREEN_HIDDEN',
  NAVIGATION_ATTEMPT: 'NAVIGATION_ATTEMPT',
} as const;

export const violationSchema = z.object({
  eventType: z.enum(VIOLATION_ENUMS),
  questionNumber: z.number().int().min(1).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const submitSchema = z.object({
  manual: z.boolean().optional().default(true),
});

export type AnswerInput = z.infer<typeof answerSchema>;
export type ViolationInput = z.infer<typeof violationSchema>;