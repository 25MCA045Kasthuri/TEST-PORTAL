import { createApp } from '../src/app';
import { App } from 'supertest/types';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Admin } from '../src/models/Admin';
import { Candidate } from '../src/models/Candidate';
import { Question } from '../src/models/Question';
import { getSettings } from '../src/models/Settings';
import { generateCandidatePassword, hashCandidatePassword } from '../src/services/candidatePassword';

export function buildApp(): App {
  return createApp() as unknown as App;
}

export async function seedAdmin(email = 'admin@swap2k26.test', password = 'Admin@1234'): Promise<string> {
  const passwordHash = await bcrypt.hash(password, 4);
  const doc = await Admin.create({ email, passwordHash, name: 'Administrator', active: true });
  return String(doc._id);
}

export async function seedCandidate(overrides: Partial<{ uid: string; name: string; mobile: string; active: boolean }> = {}) {
  const data = { uid: 'SWAP2K260001', name: 'Demo Candidate', mobile: '9876543210', ...overrides };
  const passwordHash = await hashCandidatePassword(generateCandidatePassword(data.uid));
  return Candidate.create({ ...data, passwordHash, college: 'Demo College', department: 'CS' });
}

export async function seedQuestions(count = 5) {
  const docs = Array.from({ length: count }, (_, i) => ({
    questionNumber: i + 1,
    question: `Sample question ${i + 1}?`,
    options: { A: 'a', B: 'b', C: 'c', D: 'd' },
    correctAnswer: i % 2 === 0 ? 'A' : 'B',
    marks: 1,
    active: true,
  }));
  return Question.insertMany(docs);
}

export async function ensureSettings() {
  await getSettings();
}

export async function adminLogin(app: App, email = 'admin@swap2k26.test', password = 'Admin@1234') {
  const res = await request(app).post('/api/auth/admin/login').send({ email, password });
  return res.headers['set-cookie'] ?? [];
}

export async function candidateLogin(app: App, uid = 'SWAP2K260001', password = 'Jmc0001') {
  const res = await request(app).post('/api/auth/candidate/login').send({ uid, password });
  return res.headers['set-cookie'] ?? [];
}