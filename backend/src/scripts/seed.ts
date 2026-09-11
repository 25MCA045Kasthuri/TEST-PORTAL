import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import { Admin } from '../models/Admin';
import { Candidate } from '../models/Candidate';
import { Question } from '../models/Question';
import { Settings } from '../models/Settings';
import bcrypt from 'bcryptjs';
import { generateCandidatePassword, hashCandidatePassword } from '../services/candidatePassword';

const SAMPLE_QUESTIONS = [
  { question: 'Which protocol is used for web browsing?', options: { A: 'FTP', B: 'HTTP', C: 'SMTP', D: 'SSH' }, correctAnswer: 'B' },
  { question: 'Which device forwards packets between networks?', options: { A: 'Hub', B: 'Switch', C: 'Router', D: 'Repeater' }, correctAnswer: 'C' },
  { question: 'The brain of the computer is the ____.', options: { A: 'CPU', B: 'RAM', C: 'Hard Disk', D: 'Monitor' }, correctAnswer: 'A' },
  { question: 'Which of the following is an input device?', options: { A: 'Monitor', B: 'Printer', C: 'Keyboard', D: 'Speaker' }, correctAnswer: 'C' },
  { question: 'HTML stands for ____.', options: { A: 'Hyper Text Markup Language', B: 'High Tech Modern Language', C: 'Hyper Transfer Markup Language', D: 'Home Tool Markup Language' }, correctAnswer: 'A' },
  { question: 'Which language runs in a web browser?', options: { A: 'Java', B: 'C', C: 'Python', D: 'JavaScript' }, correctAnswer: 'D' },
  { question: 'Which company developed the Android operating system?', options: { A: 'Apple', B: 'Google', C: 'Microsoft', D: 'Samsung' }, correctAnswer: 'B' },
  { question: '1KB is equal to ____ bytes.', options: { A: '1024', B: '1000', C: '512', D: '2048' }, correctAnswer: 'A' },
  { question: 'Which of these is an operating system?', options: { A: 'Linux', B: 'Microsoft Word', C: 'Photoshop', D: 'Chrome' }, correctAnswer: 'A' },
  { question: 'The full form of URL is ____.', options: { A: 'Uniform Resource Locator', B: 'Universal Remote Locator', C: 'Uniform Real Link', D: 'United Resource Locator' }, correctAnswer: 'A' },
];

export async function seedAll(): Promise<void> {
  if (env.nodeEnv === 'production') {
    throw new Error('Seeding is only allowed in development or test environments.');
  }
  await connectDatabase();

  // ---------- Admin ----------
  if (env.adminEmail && env.adminPassword) {
    const passwordHash = await bcrypt.hash(env.adminPassword, 10);
    await Admin.updateOne(
      { email: env.adminEmail.toLowerCase() },
      { $set: { email: env.adminEmail.toLowerCase(), name: 'Administrator', passwordHash, active: true } },
      { upsert: true },
    );
    // eslint-disable-next-line no-console
    console.log(`[seed] admin ready: ${env.adminEmail}`);
  } else {
    // eslint-disable-next-line no-console
    console.warn('[seed] ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping admin creation.');
  }

  // ---------- Candidates ----------
  const candidates = [
    { uid: 'SWAP2K260001', name: 'Demo Candidate', mobile: '9876543210', college: 'Demo College', department: 'Computer Science' },
    { uid: 'SWAP2K260002', name: 'Aarav Sharma', mobile: '9876543211', college: 'Demo College', department: 'Electronics' },
    { uid: 'SWAP2K260003', name: 'Priya Patel', mobile: '9876543212', college: 'Sample Institute', department: 'Mechanical' },
  ];
  // eslint-disable-next-line no-console
  console.log('Do you want to (re)create sample candidates? Set SEED_CANDIDATES=1 to enable.');
  if (process.env.SEED_CANDIDATES === '1') {
    for (const c of candidates) {
      const passwordHash = await hashCandidatePassword(generateCandidatePassword(c.uid));
      await Candidate.updateOne(
        { uid: c.uid },
        { $set: { ...c, passwordHash, active: true } },
        { upsert: true },
      );
    }
    // eslint-disable-next-line no-console
    console.log(`[seed] ${candidates.length} candidate(s) ready.`);
  }

  // ---------- Sample questions (only if none exist) ----------
  const count = await Question.countDocuments();
  if (count === 0) {
    const docs = SAMPLE_QUESTIONS.map((q, i) => ({
      questionNumber: i + 1,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      marks: 1,
      active: true,
    }));
    await Question.insertMany(docs);
    // eslint-disable-next-line no-console
    console.log(`[seed] ${docs.length} sample question(s) inserted.`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[seed] ${count} question(s) already exist; skipping sample questions.`);
  }

  // ---------- Settings ----------
  await Settings.updateOne({ key: 'global' }, { $setOnInsert: {} }, { upsert: true });
  // eslint-disable-next-line no-console
  console.log('[seed] settings ensured.');

  await disconnectDatabase();
  // eslint-disable-next-line no-console
  console.log('[seed] completed.');
}

if (require.main === module) {
  seedAll().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed', err);
    process.exit(1);
  });
}