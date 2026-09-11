import { Schema, model, Document } from 'mongoose';

export interface CandidateDoc extends Document {
  uid: string;
  name: string;
  mobile: string;
  passwordHash: string;
  college: string;
  department: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const candidateSchema = new Schema<CandidateDoc>(
  {
    uid: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true, match: /^[6-9]\d{9}$/ },
    passwordHash: { type: String, required: true, select: false },
    college: { type: String, default: '', trim: true },
    department: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

candidateSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r.passwordHash;
    return ret;
  },
});

export const Candidate = model<CandidateDoc>('Candidate', candidateSchema);
