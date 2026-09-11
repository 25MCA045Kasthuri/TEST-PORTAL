import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  buildApp,
  seedAdmin,
  seedCandidate,
  seedQuestions,
  ensureSettings,
  adminLogin,
  candidateLogin,
} from './helpers';
import { ExamAttempt } from '../src/models/ExamAttempt';
import { Candidate } from '../src/models/Candidate';
import { Question } from '../src/models/Question';
import { MalpracticeLog } from '../src/models/MalpracticeLog';
import { Admin } from '../src/models/Admin';
import { getSettings } from '../src/models/Settings';
import { verifyCandidatePassword } from '../src/services/candidatePassword';
import * as XLSX from 'xlsx';

let app: App;

beforeAll(() => {
  app = buildApp();
});

beforeEach(async () => {
  await seedAdmin();
  await ensureSettings();
  await seedQuestions(5);
});

describe('Authentication', () => {
  it('rejects candidate login with the old mobile-number password', async () => {
    await seedCandidate();
    const res = await request(app).post('/api/auth/candidate/login').send({ uid: 'swap2k260001', password: '9999999998' });
    expect(res.status).toBe(401);
  });

  it('rejects invalid UID format', async () => {
    const res = await request(app).post('/api/auth/candidate/login').send({ uid: 'BAD', password: 'Jmc0001' });
    expect(res.status).toBe(400);
  });

  it('allows candidate login with normalized UID and UID-derived password', async () => {
    await seedCandidate();
    const res = await request(app).post('/api/auth/candidate/login').send({ uid: '  swap2k260001  ', password: 'Jmc0001' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('password login: correct UID-derived password succeeds', async () => {
    await seedCandidate();
    expect((await request(app).post('/api/auth/candidate/login').send({ uid: 'SWAP2K260001', password: 'Jmc0001' })).status).toBe(200);
  });

  it('password login: old mobile number no longer authenticates', async () => {
    await seedCandidate();
    expect((await request(app).post('/api/auth/candidate/login').send({ uid: 'SWAP2K260001', password: '9876543210' })).status).toBe(401);
  });

  it('password login: passwords are case-sensitive', async () => {
    await seedCandidate();
    expect((await request(app).post('/api/auth/candidate/login').send({ uid: 'SWAP2K260001', password: 'jmc0001' })).status).toBe(401);
    expect((await request(app).post('/api/auth/candidate/login').send({ uid: 'SWAP2K260001', password: 'JMC0001' })).status).toBe(401);
  });

  it('password login: another candidate\'s password fails', async () => {
    await seedCandidate();
    await seedCandidate({ uid: 'SWAP2K260002', name: 'Second', mobile: '9876543211' });
    expect((await request(app).post('/api/auth/candidate/login').send({ uid: 'SWAP2K260002', password: 'Jmc0001' })).status).toBe(401);
    expect((await request(app).post('/api/auth/candidate/login').send({ uid: 'SWAP2K260002', password: 'Jmc0002' })).status).toBe(200);
  });

  it('allows admin login and rejects wrong password', async () => {
    const good = await request(app).post('/api/auth/admin/login').send({ email: 'admin@swap2k26.test', password: 'Admin@1234' });
    expect(good.status).toBe(200);
    const bad = await request(app).post('/api/auth/admin/login').send({ email: 'admin@swap2k26.test', password: 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('protected routes reject anonymous requests', async () => {
    expect((await request(app).get('/api/exam/status')).status).toBe(401);
    expect((await request(app).get('/api/admin/dashboard')).status).toBe(401);
  });

  it('candidate cannot access admin endpoints', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    expect((await request(app).get('/api/admin/dashboard').set('Cookie', jar)).status).toBe(403);
  });

  it('admin cannot access candidate exam endpoints', async () => {
    const jar = await adminLogin(app);
    expect((await request(app).get('/api/exam/status').set('Cookie', jar)).status).toBe(403);
  });
describe('Exam flow', () => {
  it('full flow: start, save, update, refresh, submit', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    expect((await request(app).get('/api/exam/status').set('Cookie', jar)).body.data.state).toBe('NOT_STARTED');

    const start = await request(app).post('/api/exam/start').set('Cookie', jar);
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('ACTIVE');
    expect(start.body.data.remainingSeconds).toBeGreaterThan(0);

    const qs = await request(app).get('/api/exam/questions').set('Cookie', jar);
    const question = qs.body.data.questions[0];
    expect(question.correctAnswer).toBeUndefined();
    expect(Object.keys(question)).toContain('options');

    const qId = question._id;
    const save = await request(app)
      .put('/api/exam/answer').set('Cookie', jar)
      .send({ questionId: qId, selectedAnswer: 'B', questionNumber: question.questionNumber, clear: false });
    expect(save.status).toBe(200);
    expect(save.body.data.answeredCount).toBe(1);

    const upd = await request(app)
      .put('/api/exam/answer').set('Cookie', jar)
      .send({ questionId: qId, selectedAnswer: 'A', questionNumber: question.questionNumber, clear: false });
    expect(upd.body.data.selectedAnswer).toBe('A');

    expect((await request(app).post('/api/exam/start').set('Cookie', jar)).status).toBe(409);

    const again = await request(app).get('/api/exam/attempt').set('Cookie', jar);
    expect(again.body.data.answers.find((a: { question: string }) => a.question === qId).selectedAnswer).toBe('A');

    const submit = await request(app).post('/api/exam/submit').set('Cookie', jar).send({ manual: true });
    expect(submit.status).toBe(200);
    expect(submit.body.data.status).toBe('SUBMITTED');

    const after = await request(app)
      .put('/api/exam/answer').set('Cookie', jar)
      .send({ questionId: qId, selectedAnswer: 'C', questionNumber: 1, clear: false });
    expect(after.status).toBe(404);
  });

  it('does not expose correct answers', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    const qs = await request(app).get('/api/exam/questions').set('Cookie', jar);
    for (const q of qs.body.data.questions) expect(q.correctAnswer).toBeUndefined();
  });

  it('rejects answer updates after expiry', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    const attempt = await ExamAttempt.findOne({});
    attempt!.expiresAt = new Date(Date.now() - 1000);
    await attempt!.save();
    const qs = await request(app).get('/api/exam/questions').set('Cookie', jar);
    const qId = qs.body.data.questions[0]._id;
    const res = await request(app)
      .put('/api/exam/answer').set('Cookie', jar)
      .send({ questionId: qId, selectedAnswer: 'A', questionNumber: 1, clear: false });
    expect(res.status).toBe(400);
  });

  it('auto-submits expired exam on status check', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    const attempt = await ExamAttempt.findOne({});
    attempt!.expiresAt = new Date(Date.now() - 1000);
    await attempt!.save();
    const status = await request(app).get('/api/exam/status').set('Cookie', jar);
    expect(status.body.data.state).toBe('TIMED_OUT');
    expect((await ExamAttempt.findById(attempt!._id))!.status).toBe('TIMED_OUT');
  });
});
describe('Malpractice', () => {
  it('logs tab switch and increments violation count', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    const res = await request(app)
      .post('/api/exam/violation').set('Cookie', jar)
      .send({ eventType: 'TAB_SWITCH', questionNumber: 1, metadata: {} });
    expect(res.status).toBe(200);
    expect(res.body.data.violationCount).toBe(1);
    expect(res.body.data.malpracticeStatus).toBe('WARNING');
    expect(await MalpracticeLog.countDocuments({ eventType: 'TAB_SWITCH' })).toBe(1);
  });

  it('auto-terminates after max violations', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    await request(app).post('/api/exam/violation').set('Cookie', jar).send({ eventType: 'TAB_SWITCH', questionNumber: 1, metadata: {} });
    const res = await request(app).post('/api/exam/violation').set('Cookie', jar).send({ eventType: 'FULLSCREEN_EXIT', questionNumber: 2, metadata: {} });
    expect(res.body.data.terminated).toBe(true);
    const db = await ExamAttempt.findOne({});
    expect(db!.status).toBe('TERMINATED');
    expect(db!.finalScore).toBe(0);
  });

  it('prevents duplicate active exam (multiple login protection)', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    expect((await request(app).post('/api/exam/start').set('Cookie', jar)).status).toBe(409);
  });
});
describe('Admin', () => {
  it('dashboard shows registered count', async () => {
    await seedCandidate();
    const jar = await adminLogin(app);
    const res = await request(app).get('/api/admin/dashboard').set('Cookie', jar);
    expect(res.status).toBe(200);
    expect(res.body.data.registeredCandidates).toBe(1);
  });

  it('admin can create candidate and rejects duplicates', async () => {
    const jar = await adminLogin(app);
    const created = await request(app)
      .post('/api/admin/candidates').set('Cookie', jar)
      .send({ uid: 'SWAP2K260099', name: 'New Person', mobile: '9988776655', college: 'C', department: 'D' });
    expect(created.status).toBe(201);
    const dup = await request(app)
      .post('/api/admin/candidates').set('Cookie', jar)
      .send({ uid: 'SWAP2K260099', name: 'New Person', mobile: '9988776655' });
    expect(dup.status).toBe(409);
  });

  it('admin can create, update and delete a question', async () => {
    const jar = await adminLogin(app);
    expect((await request(app).get('/api/admin/questions').set('Cookie', jar)).body.data.questions).toHaveLength(5);
    const created = await request(app)
      .post('/api/admin/questions').set('Cookie', jar)
      .send({ questionNumber: 99, question: 'Q?', options: { A: '1', B: '2', C: '3', D: '4' }, correctAnswer: 'C', marks: 1, active: true });
    expect(created.status).toBe(200);
    const upd = await request(app).put(`/api/admin/questions/${created.body.data._id}`).set('Cookie', jar).send({ active: false });
    expect(upd.body.data.active).toBe(false);
    expect((await request(app).delete(`/api/admin/questions/${created.body.data._id}`).set('Cookie', jar)).status).toBe(200);
  });

  function questionExcel(rows: unknown[][], sheetName = 'Sheet1'): Buffer {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
  }

  const importHeader = ['Question No', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer'];

  it('importing Excel replaces the full question set', async () => {
    const jar = await adminLogin(app);
    const buffer = questionExcel([
      importHeader,
      [1, 'NEW QUESTION A', 'a1', 'b1', 'c1', 'd1', 'A'],
      [2, 'NEW QUESTION B', 'a2', 'b2', 'c2', 'd2', 'B'],
      [3, 'NEW QUESTION C', 'a3', 'b3', 'c3', 'd3', 'C'],
    ]);
    const res = await request(app)
      .post('/api/admin/questions/import')
      .set('Cookie', jar)
      .attach('file', buffer, 'questions.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(3);
    expect(res.body.data.rejected).toBe(0);
    expect(res.body.data.replacedExisting).toBe(true);
    expect(await Question.countDocuments()).toBe(3);
    expect(await Question.findOne({ questionNumber: 1 })).toMatchObject({ question: 'NEW QUESTION A' });
    expect(await Question.findOne({ question: 'Sample question 1?' })).toBeNull();
  });

  it('importing a header-only Excel returns 400 and leaves questions unchanged', async () => {
    const jar = await adminLogin(app);
    const buffer = questionExcel([importHeader]);
    const res = await request(app)
      .post('/api/admin/questions/import')
      .set('Cookie', jar)
      .attach('file', buffer, 'empty.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no question rows were present/i);
    expect(await Question.countDocuments()).toBe(5);
  });

  it('importing Excel fails validation and leaves questions unchanged', async () => {
    const jar = await adminLogin(app);
    const buffer = questionExcel([
      importHeader,
      [1, 'Q1', 'a', 'b', 'c', 'd', 'X'],
      [2, '', 'a', 'b', '', 'd', 'A'],
    ]);
    const res = await request(app)
      .post('/api/admin/questions/import')
      .set('Cookie', jar)
      .attach('file', buffer, 'bad.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/validation failed/i);
    expect(res.body.details).toBeDefined();
    expect(await Question.countDocuments()).toBe(5);
  });

  it('rejects import while an examination is active and keeps questions', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    const adminJar = await adminLogin(app);
    const buffer = questionExcel([importHeader, [1, 'NEW Q', 'a', 'b', 'c', 'd', 'A']]);
    const res = await request(app)
      .post('/api/admin/questions/import')
      .set('Cookie', adminJar)
      .attach('file', buffer, 'active.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/examination is currently active/i);
    expect(await Question.countDocuments()).toBe(5);
  });

  it('calculates results correctly after submission', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    const qs = await request(app).get('/api/exam/questions').set('Cookie', jar);
    const q = qs.body.data.questions;
    await request(app).put('/api/exam/answer').set('Cookie', jar).send({ questionId: q[0]._id, selectedAnswer: 'A', questionNumber: 1, clear: false });
    await request(app).put('/api/exam/answer').set('Cookie', jar).send({ questionId: q[1]._id, selectedAnswer: 'B', questionNumber: 2, clear: false });
    await request(app).put('/api/exam/answer').set('Cookie', jar).send({ questionId: q[2]._id, selectedAnswer: 'A', questionNumber: 3, clear: false });
    await request(app).post('/api/exam/submit').set('Cookie', jar).send({ manual: true });
    const db = await ExamAttempt.findOne({});
    expect(db!.correctAnswers).toBe(3);
    expect(db!.rawScore).toBe(3);
    expect(db!.finalScore).toBe(3);
    const adminJar = await adminLogin(app);
    const results = await request(app).get('/api/admin/results').set('Cookie', adminJar);
    expect(results.body.data.results[0].correct).toBe(3);
  });

  it('confirm malpractice zeroes final score but keeps raw', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    const qs = await request(app).get('/api/exam/questions').set('Cookie', jar);
    await request(app).put('/api/exam/answer').set('Cookie', jar).send({ questionId: qs.body.data.questions[0]._id, selectedAnswer: 'A', questionNumber: 1, clear: false });
    await request(app).post('/api/exam/submit').set('Cookie', jar).send({ manual: true });
    const attempt = await ExamAttempt.findOne({});
    const adminJar = await adminLogin(app);
    const res = await request(app).put(`/api/admin/malpractice/${attempt!._id}`).set('Cookie', adminJar).send({ action: 'CONFIRM' });
    expect(res.status).toBe(200);
    const db = await ExamAttempt.findById(attempt!._id);
    expect(db!.malpracticeStatus).toBe('CONFIRMED');
    expect(db!.rawScore).toBe(1);
    expect(db!.finalScore).toBe(0);
  });

  it('settings cannot change while an exam is active', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    const adminJar = await adminLogin(app);
    expect((await request(app).put('/api/admin/settings').set('Cookie', adminJar).send({ durationMinutes: 30 })).status).toBe(400);
  });

  it('export results returns an xlsx buffer', async () => {
    await seedCandidate();
    const jar = await candidateLogin(app);
    await request(app).post('/api/exam/start').set('Cookie', jar);
    await request(app).post('/api/exam/submit').set('Cookie', jar).send({ manual: true });
    const adminJar = await adminLogin(app);
    const res = await request(app).get('/api/admin/results/export').set('Cookie', adminJar);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
  });
});

describe('Settings model', () => {
  it('default settings are 60 minutes', async () => {
    const s = await getSettings();
    expect(s.durationMinutes).toBe(60);
  });
});

describe('Results ranking API', () => {
  async function mkAttempt(candidate: { _id: string }, partial: Record<string, unknown> = {}) {
    return ExamAttempt.create({
      candidate: candidate._id,
      sessionId: 'session-' + Math.random().toString(36).slice(2),
      startedAt: new Date(),
      expiresAt: new Date(),
      status: 'SUBMITTED',
      malpracticeStatus: 'NORMAL',
      finalScore: 0,
      rawScore: 0,
      durationUsed: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      unanswered: 0,
      violationCount: 0,
      ...partial,
    });
  }

  it('ranks by finalScore DESC then durationUsed ASC with no duplicates', async () => {
    await seedCandidate({ uid: 'SWAP2K260001', name: 'Alpha' });
    await seedCandidate({ uid: 'SWAP2K260002', name: 'Beta' });
    await seedCandidate({ uid: 'SWAP2K260003', name: 'Gamma' });
    const cands = await Candidate.find().sort({ uid: 1 }).lean();
    await mkAttempt(cands[0], { finalScore: 29, rawScore: 29, durationUsed: 178, correctAnswers: 29, submittedAt: new Date('2026-01-01T10:00:00Z') });
    await mkAttempt(cands[1], { finalScore: 29, rawScore: 29, durationUsed: 195, correctAnswers: 29, submittedAt: new Date('2026-01-01T10:01:00Z') });
    await mkAttempt(cands[2], { finalScore: 27, rawScore: 27, durationUsed: 160, correctAnswers: 27, submittedAt: new Date('2026-01-01T10:02:00Z') });
    // A later TERMINATED attempt exists but must not hide Gamma's legitimate result
    // or occupy a second official row.
    await mkAttempt(cands[2], {
      status: 'TERMINATED',
      malpracticeStatus: 'TERMINATED',
      finalScore: 0,
      rawScore: 30,
      durationUsed: 90,
      submittedAt: new Date('2026-01-01T10:03:00Z'),
    });

    const jar = await adminLogin(app);
    const res = await request(app).get('/api/admin/results?sort=score_desc').set('Cookie', jar);
    expect(res.status).toBe(200);
    const rows = res.body.data.results;
    expect(rows).toHaveLength(3); // one candidate appears only once
    expect(rows[0].uid).toBe('SWAP2K260001');
    expect(rows[0].rank).toBe(1);
    expect(rows[1].uid).toBe('SWAP2K260002');
    expect(rows[1].rank).toBe(2);
    expect(rows[2].uid).toBe('SWAP2K260003');
    expect(rows[2].rank).toBe(3); // Gamma's TERMINATED attempt did not replace the legit one

    const summary = res.body.data.summary;
    expect(summary.topScore).toBe(29);
    expect(summary.totalRegistered).toBe(3);
    expect(summary.attended).toBe(3);
    expect(summary.submitted).toBe(3);
  });

  it('exact ties share a rank using competition ranking', async () => {
    await seedCandidate({ uid: 'SWAP2K260001', name: 'Alpha' });
    await seedCandidate({ uid: 'SWAP2K260002', name: 'Beta' });
    await seedCandidate({ uid: 'SWAP2K260003', name: 'Gamma' });
    const cands = await Candidate.find().sort({ uid: 1 }).lean();
    await mkAttempt(cands[0], { finalScore: 28, durationUsed: 180 });
    await mkAttempt(cands[1], { finalScore: 28, durationUsed: 180 });
    await mkAttempt(cands[2], { finalScore: 27, durationUsed: 160 });

    const jar = await adminLogin(app);
    const res = await request(app).get('/api/admin/results').set('Cookie', jar);
    const rows = res.body.data.results;
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(1);
    expect(rows[2].rank).toBe(3);
  });

  it('excludes confirmed-malpractice candidates from ranking', async () => {
    await seedCandidate({ uid: 'SWAP2K260001', name: 'Alpha' });
    await seedCandidate({ uid: 'SWAP2K260002', name: 'Beta' });
    const cands = await Candidate.find().sort({ uid: 1 }).lean();
    await mkAttempt(cands[0], { finalScore: 0, rawScore: 30, malpracticeStatus: 'CONFIRMED' });
    await mkAttempt(cands[1], { finalScore: 15, rawScore: 15 });

    const jar = await adminLogin(app);
    const res = await request(app).get('/api/admin/results').set('Cookie', jar);
    const rows = res.body.data.results;
    const confirmed = rows.find((r: { uid: string }) => r.uid === 'SWAP2K260001');
    expect(confirmed.rank).toBeNull();
    expect(rows.find((r: { uid: string }) => r.uid === 'SWAP2K260002').rank).toBe(1);
  });

  it('fastest-time sort orders numerically by duration', async () => {
    await seedCandidate({ uid: 'SWAP2K260001', name: 'Alpha' });
    await seedCandidate({ uid: 'SWAP2K260002', name: 'Beta' });
    const cands = await Candidate.find().sort({ uid: 1 }).lean();
    await mkAttempt(cands[0], { finalScore: 20, durationUsed: 600 });
    await mkAttempt(cands[1], { finalScore: 22, durationUsed: 120 });

    const jar = await adminLogin(app);
    const res = await request(app)
      .get('/api/admin/results?sort=time_asc')
      .set('Cookie', jar);
    expect(res.body.data.results[0].uid).toBe('SWAP2K260002');
    expect(res.body.data.results[0].rank).toBe(1);
  });
});

describe('Candidate & Question import/reset', () => {
  function candidateWorkbook(
    rows: unknown[][],
    opts: { sheetName?: string; extraSheets?: Array<{ name: string; rows: unknown[][] }> } = {},
  ): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), opts.sheetName ?? 'Candidates');
    for (const s of opts.extraSheets ?? []) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
    }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
  }

  const candidateHeader = ['UID', 'Name', 'Mobile', 'College', 'Department'];

  function questionWorkbook(rows: unknown[][], sheetName = 'Questions'): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
  }

  const standardHeader = ['Question No', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer'];

  describe('Candidate Excel import', () => {
    it('imports 59 candidates and ignores the Login Reference sheet', async () => {
      const jar = await adminLogin(app);
      const dataRows = Array.from({ length: 59 }, (_, i) => [
        `SWAP2K26${String(i + 1).padStart(4, '0')}`,
        `Candidate ${i + 1}`,
        String(9000000000 + i),
        'Test College',
        'CS',
      ]);
      const buffer = candidateWorkbook(
        [candidateHeader, ...dataRows],
        {
          extraSheets: [
            // Must be IGNORED — contains only UID/Name/Expected Password (not a candidate sheet)
            {
              name: 'Login Reference',
              rows: [
                ['UID', 'Name', 'Expected Password'],
                ['SWAP2K269999', 'Fake Login Sheet Row', 'Jmc9999'],
              ],
            },
          ],
        },
      );
      const res = await request(app)
        .post('/api/admin/candidates/import')
        .set('Cookie', jar)
        .attach('file', buffer, 'candidates.xlsx');
      expect(res.status).toBe(200);
      expect(res.body.data.successful).toBe(59);
      expect(res.body.data.failed).toHaveLength(0);
      expect(await Candidate.countDocuments()).toBe(59);

      const c1 = await Candidate.findOne({ uid: 'SWAP2K260001' }).select('+passwordHash');
      expect(c1).not.toBeNull();
      expect(await verifyCandidatePassword('Jmc0001', c1!.passwordHash)).toBe(true);

      const c59 = await Candidate.findOne({ uid: 'SWAP2K260059' }).select('+passwordHash');
      expect(c59).not.toBeNull();
      expect(await verifyCandidatePassword('Jmc0059', c59!.passwordHash)).toBe(true);

      // Login Reference sheet row must NOT have been imported
      expect(await Candidate.findOne({ uid: 'SWAP2K269999' })).toBeNull();
    });

    it('rejects invalid UID rows without affecting valid candidates', async () => {
      const jar = await adminLogin(app);
      const buffer = candidateWorkbook([
        candidateHeader,
        ['SWAP2K260001', 'Valid One', '9000000001', 'C', 'D'],
        ['SWAP0059', 'Bad UID', '9000000002', 'C', 'D'],
        ['SWAP2K260003', 'Valid Three', '9000000003', 'C', 'D'],
      ]);
      const res = await request(app)
        .post('/api/admin/candidates/import')
        .set('Cookie', jar)
        .attach('file', buffer, 'candidates.xlsx');
      expect(res.status).toBe(200);
      expect(res.body.data.successful).toBe(2);
      expect(res.body.data.failed).toHaveLength(1);
      expect(res.body.data.failed[0].uid).toBe('SWAP0059');
      expect(res.body.data.failed[0].reason).toMatch(/Invalid UID format/i);
      expect(await Candidate.countDocuments()).toBe(2);
    });

    it('rejects duplicates against existing DB records without blocking others', async () => {
      await seedCandidate({ uid: 'SWAP2K260001' });
      const jar = await adminLogin(app);
      const buffer = candidateWorkbook([
        candidateHeader,
        ['SWAP2K260001', 'Already Exists', '9000000001', 'C', 'D'],
        ['SWAP2K260002', 'Fresh', '9000000002', 'C', 'D'],
      ]);
      const res = await request(app)
        .post('/api/admin/candidates/import')
        .set('Cookie', jar)
        .attach('file', buffer, 'candidates.xlsx');
      expect(res.status).toBe(200);
      expect(res.body.data.successful).toBe(1);
      expect(res.body.data.failed).toHaveLength(1);
      expect(res.body.data.failed[0].reason).toMatch(/already exists/i);
    });

    it('rejects uploads with a wrong header layout', async () => {
      const jar = await adminLogin(app);
      const buffer = candidateWorkbook([
        ['UID', 'Name', 'Expected Password'],
        ['SWAP2K260001', 'Aaban', 'Jmc0001'],
      ]);
      const res = await request(app)
        .post('/api/admin/candidates/import')
        .set('Cookie', jar)
        .attach('file', buffer, 'candidates.xlsx');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Candidate sheet must contain UID, Name, Mobile, College and Department/i);
      expect(await Candidate.countDocuments()).toBe(0);
    });
  });

  describe('Candidate list reset', () => {
    it('clears candidates but keeps questions, admin and settings intact', async () => {
      await seedCandidate({ uid: 'SWAP2K260001' });
      await seedCandidate({ uid: 'SWAP2K260002' });
      const jar = await adminLogin(app);
      const res = await request(app).delete('/api/admin/candidates/reset').set('Cookie', jar);
      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(2);
      expect(await Candidate.countDocuments()).toBe(0);
      expect(await Question.countDocuments()).toBe(5);
      expect(await Admin.countDocuments()).toBe(1);
      expect((await getSettings()).examTitle).toBeDefined();
    });

    it('blocks reset while an examination is active', async () => {
      await seedCandidate();
      const jar = await candidateLogin(app);
      await request(app).post('/api/exam/start').set('Cookie', jar);
      const adminJar = await adminLogin(app);
      const res = await request(app).delete('/api/admin/candidates/reset').set('Cookie', adminJar);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot be reset while an examination is active/i);
      expect(await Candidate.countDocuments()).toBe(1);
    });
  });

  describe('Question Excel import', () => {
    it('detects the standard format and replaces the question set', async () => {
      const jar = await adminLogin(app);
      const buffer = questionWorkbook([
        standardHeader,
        [1, 'Which device forwards packets between different networks?', 'Hub', 'Switch', 'Router', 'Repeater', 'C'],
        [2, 'Q2', 'a', 'b', 'c', 'd', 'B'],
        [3, 'Q3', 'a', 'b', 'c', 'd', 'A'],
      ]);
      const res = await request(app)
        .post('/api/admin/questions/import')
        .set('Cookie', jar)
        .attach('file', buffer, 'questions.xlsx');
      expect(res.status).toBe(200);
      expect(res.body.data.format).toBe('new');
      expect(res.body.data.imported).toBe(3);
      expect(res.body.data.rejected).toBe(0);
      expect(await Question.countDocuments()).toBe(3);
      expect(await Question.findOne({ questionNumber: 1 }).select('+correctAnswer')).toMatchObject({
        question: expect.stringContaining('forwards packets'),
        correctAnswer: 'C',
      });
    });

    it('detects the legacy IPL format and converts Four Options + Result', async () => {
      const jar = await adminLogin(app);
      const buffer = questionWorkbook(
        [
          ['IPL QUIZ - MULTIPLE CHOICE QUESTIONS'],
          [''],
          ['S.No', 'Question', 'Four Options', 'Result'],
          [1, 'In which IPL Season was the Impact Player rule introduced?', 'A) 2024\nB) 2022\nC) 2021\nD) 2023', 'D) 2023'],
        ],
        'Sheet1',
      );
      const res = await request(app)
        .post('/api/admin/questions/import')
        .set('Cookie', jar)
        .attach('file', buffer, 'ipl.xlsx');
      expect(res.status).toBe(200);
      expect(res.body.data.format).toBe('legacy-ipl');
      expect(res.body.data.imported).toBe(1);
      expect(res.body.data.rejected).toBe(0);
      const q = await Question.findOne({ questionNumber: 1 }).select('+correctAnswer').lean();
      expect(q).toMatchObject({
        question: expect.stringContaining('Impact Player'),
        options: {
          A: '2024',
          B: '2022',
          C: '2021',
          D: '2023',
        },
        correctAnswer: 'D',
      });
    });

    it('auto-corrects a stale legacy result letter when the answer text matches an option', async () => {
      const jar = await adminLogin(app);
      const buffer = questionWorkbook(
        [
          ['IPL QUIZ - MULTIPLE CHOICE QUESTIONS'],
          [''],
          ['S.No', 'Question', 'Four Options', 'Result'],
          [1, 'Which team won?', 'A) Chennai Super Kings\nB) Rajasthan Royals\nC) Punjab Kings\nD) Mumbai Indians', 'A) Punjab Kings'],
        ],
        'Sheet1',
      );
      const res = await request(app)
        .post('/api/admin/questions/import')
        .set('Cookie', jar)
        .attach('file', buffer, 'ipl.xlsx');
      expect(res.status).toBe(200);
      const q = await Question.findOne({ questionNumber: 1 }).select('+correctAnswer').lean();
      expect(q!.correctAnswer).toBe('C');
    });

    it('rejects a header-only book and keeps the current set', async () => {
      const jar = await adminLogin(app);
      const buffer = questionWorkbook([standardHeader]);
      const res = await request(app)
        .post('/api/admin/questions/import')
        .set('Cookie', jar)
        .attach('file', buffer, 'empty.xlsx');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no question rows were present/i);
      expect(await Question.countDocuments()).toBe(5);
    });

    it('rejects an unsupported layout with a clear message', async () => {
      const jar = await adminLogin(app);
      const buffer = questionWorkbook([['Foo', 'Bar', 'Baz']]);
      const res = await request(app)
        .post('/api/admin/questions/import')
        .set('Cookie', jar)
        .attach('file', buffer, 'bad.xlsx');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/No supported question header format was found/i);
    });
  });

  describe('Question list reset', () => {
    it('clears questions but keeps candidates, admin and settings intact', async () => {
      await seedCandidate();
      const jar = await adminLogin(app);
      const res = await request(app).delete('/api/admin/questions/reset').set('Cookie', jar);
      expect(res.status).toBe(200);
      expect(await Question.countDocuments()).toBe(0);
      expect(await Candidate.countDocuments()).toBe(1);
      expect(await Admin.countDocuments()).toBe(1);
      expect((await getSettings()).examTitle).toBeDefined();
    });

    it('blocks reset while an examination is active', async () => {
      await seedCandidate();
      const jar = await candidateLogin(app);
      await request(app).post('/api/exam/start').set('Cookie', jar);
      const adminJar = await adminLogin(app);
      const res = await request(app).delete('/api/admin/questions/reset').set('Cookie', adminJar);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot be reset while an examination is active/i);
      expect(await Question.countDocuments()).toBe(5);
    });

    it('candidate cannot reset questions or candidates', async () => {
      await seedCandidate();
      const jar = await candidateLogin(app);
      expect((await request(app).delete('/api/admin/questions/reset').set('Cookie', jar)).status).toBe(403);
      expect((await request(app).delete('/api/admin/candidates/reset').set('Cookie', jar)).status).toBe(403);
    });
  });
});
});