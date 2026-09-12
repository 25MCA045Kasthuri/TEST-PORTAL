import { Schema, model, Document, Types } from 'mongoose';

export const MALPRACTICE_EVENTS = [
  'TAB_SWITCH',
  'WINDOW_BLUR',
  'FULLSCREEN_EXIT',
  'COPY_ATTEMPT',
  'PASTE_ATTEMPT',
  'CUT_ATTEMPT',
  'CONTEXT_MENU_ATTEMPT',
  'SHORTCUT_ATTEMPT',
  'MULTIPLE_LOGIN_ATTEMPT',
] as const;

export type MalpracticeEvent = (typeof MALPRACTICE_EVENTS)[number];

export const MAJOR_EVENTS: MalpracticeEvent[] = ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'MULTIPLE_LOGIN_ATTEMPT'];

/**
 * Minor events that count toward the 3-minor-violation automatic termination.
 *
 * WINDOW_BLUR is intentionally excluded: a tab switch fires both TAB_SWITCH
 * (major) and WINDOW_BLUR together, so counting WINDOW_BLUR here would double-
 * count the same user action.
 */
export const MINOR_VIOLATION_EVENTS: MalpracticeEvent[] = [
  'COPY_ATTEMPT',
  'PASTE_ATTEMPT',
  'CUT_ATTEMPT',
  'CONTEXT_MENU_ATTEMPT',
  'SHORTCUT_ATTEMPT',
];

export const MINOR_VIOLATION_LIMIT = 3;

export interface MalpracticeLogDoc extends Document {
  candidate: Types.ObjectId;
  attempt?: Types.ObjectId | null;
  eventType: MalpracticeEvent;
  questionNumber?: number | null;
  sessionId: string;
  severity: 'MAJOR' | 'MINOR';
  userAgent: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

const logSchema = new Schema<MalpracticeLogDoc>({
  candidate: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
  attempt: { type: Schema.Types.ObjectId, ref: 'ExamAttempt', default: null },
  eventType: { type: String, enum: MALPRACTICE_EVENTS, required: true },
  questionNumber: { type: Number, default: null },
  sessionId: { type: String, default: '' },
  severity: { type: String, enum: ['MAJOR', 'MINOR'], default: 'MINOR' },
  userAgent: { type: String, default: '' },
  metadata: { type: Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now },
});

logSchema.index({ attempt: 1, timestamp: -1 });

export const MalpracticeLog = model<MalpracticeLogDoc>('MalpracticeLog', logSchema);
