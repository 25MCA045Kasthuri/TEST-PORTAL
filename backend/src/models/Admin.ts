import { Schema, model, Document } from 'mongoose';

export interface AdminDoc extends Document {
  email: string;
  name: string;
  passwordHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<AdminDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, default: 'Administrator', trim: true },
    passwordHash: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

adminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r.passwordHash;
    return ret;
  },
});

export const Admin = model<AdminDoc>('Admin', adminSchema);
