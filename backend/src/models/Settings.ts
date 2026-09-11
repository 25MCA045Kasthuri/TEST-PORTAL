import { Schema, model, Document } from 'mongoose';

export interface SettingsDoc extends Document {
  key: string;
  examTitle: string;
  durationMinutes: number;
  totalQuestions: number;
  marksPerCorrect: number;
  maxViolations: number;
  autoTerminateEnabled: boolean;
  fullscreenRequired: boolean;
  examEnabled: boolean;
  updatedAt: Date;
}

const settingsSchema = new Schema<SettingsDoc>(
  {
    key: { type: String, default: 'global', unique: true },
    examTitle: { type: String, default: 'SWAP 2K26 Examination' },
    durationMinutes: { type: Number, default: 60, min: 1, max: 600 },
    totalQuestions: { type: Number, default: 100, min: 1 },
    marksPerCorrect: { type: Number, default: 1, min: 0 },
    maxViolations: { type: Number, default: 2, min: 1 },
    autoTerminateEnabled: { type: Boolean, default: true },
    fullscreenRequired: { type: Boolean, default: false },
    examEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Settings = model<SettingsDoc>('Settings', settingsSchema);

export async function getSettings(): Promise<SettingsDoc> {
  const existing = await Settings.findOne({ key: 'global' });
  if (existing) return existing;
  return Settings.create({ key: 'global' });
}
