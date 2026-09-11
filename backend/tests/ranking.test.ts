import { describe, it, expect } from 'vitest';
import {
  FinalAttempt,
  sortFinalAttempts,
  computeRanks,
  isRankable,
  latestAttemptPerCandidate,
  toFinalAttempt,
  byScoreThenTime,
} from '../src/services/rankingService';

function attempt(partial: Partial<FinalAttempt>): FinalAttempt {
  return {
    attemptId: 'a',
    candidate: 'c',
    status: 'SUBMITTED',
    malpracticeStatus: 'NORMAL',
    finalScore: 0,
    rawScore: 0,
    durationUsed: 0,
    correct: 0,
    wrong: 0,
    unanswered: 0,
    violationCount: 0,
    submittedAt: new Date(0),
    ...partial,
  };
}

function ranks(fa: FinalAttempt[]): Record<string, number> {
  const sorted = [...fa].sort(byScoreThenTime);
  return Object.fromEntries([...computeRanks(sorted).entries()].map(([id, r]) => [id, r]));
}

describe('Result ranking', () => {
  it('TEST 1: higher score wins even when another candidate is faster', () => {
    const a = attempt({ attemptId: 'a', candidate: 'a', finalScore: 30, durationUsed: 300 });
    const b = attempt({ attemptId: 'b', candidate: 'b', finalScore: 29, durationUsed: 100 });
    expect(ranks([a, b]).a).toBe(1);
    expect(ranks([a, b]).b).toBe(2);
  });

  it('TEST 2: equal score -> faster time ranks higher', () => {
    const a = attempt({ attemptId: 'a', candidate: 'a', finalScore: 28, durationUsed: 300 });
    const b = attempt({ attemptId: 'b', candidate: 'b', finalScore: 28, durationUsed: 250 });
    const r = ranks([a, b]);
    expect(r.b).toBe(1);
    expect(r.a).toBe(2);
  });

  it('TEST 3: exact ties share rank with competition ranking (1,1,3)', () => {
    const a = attempt({ attemptId: 'a', candidate: 'a', finalScore: 28, durationUsed: 200 });
    const b = attempt({ attemptId: 'b', candidate: 'b', finalScore: 28, durationUsed: 200 });
    const c = attempt({ attemptId: 'c', candidate: 'c', finalScore: 27, durationUsed: 150 });
    const r = ranks([a, b, c]);
    expect(r.a).toBe(1);
    expect(r.b).toBe(1);
    expect(r.c).toBe(3);
  });

  it('TEST 4: terminated candidates are excluded from official ranking', () => {
    const terminated = attempt({
      attemptId: 't',
      candidate: 't',
      finalScore: 30,
      durationUsed: 700,
      status: 'TERMINATED',
      malpracticeStatus: 'TERMINATED',
    });
    const normal = attempt({ attemptId: 'n', candidate: 'n', finalScore: 20, durationUsed: 300 });
    const eligible = [terminated, normal].filter(isRankable);
    expect(eligible).toHaveLength(1);
    const r = computeRanks([...eligible].sort(byScoreThenTime));
    expect(r.get('t')).toBeUndefined();
    expect(r.get('n')).toBe(1);
  });

  it('TEST 5: confirmed malpractice candidate cannot rank using rawScore', () => {
    const confirmed = attempt({
      attemptId: 'm',
      candidate: 'm',
      finalScore: 0,
      rawScore: 30,
      durationUsed: 100,
      malpracticeStatus: 'CONFIRMED',
    });
    const normal = attempt({ attemptId: 'n', candidate: 'n', finalScore: 15, durationUsed: 500 });
    const eligible = [confirmed, normal].filter(isRankable);
    expect(eligible).toHaveLength(1);
    const r = computeRanks([...eligible].sort(byScoreThenTime));
    expect(r.get('m')).toBeUndefined();
    expect(r.get('n')).toBe(1);
  });

  it('one candidate occupies exactly one official position (latest attempt wins)', () => {
    const oldAttempt = attempt({
      attemptId: 'old',
      candidate: 'cand1',
      finalScore: 22,
      durationUsed: 300,
      submittedAt: new Date('2026-01-01T10:00:00Z'),
    });
    const newAttempt = attempt({
      attemptId: 'new',
      candidate: 'cand1',
      finalScore: 25,
      durationUsed: 280,
      submittedAt: new Date('2026-01-01T11:00:00Z'),
    });
    const best = latestAttemptPerCandidate([oldAttempt, newAttempt]);
    expect(best).toHaveLength(1);
    expect(best[0].attemptId).toBe('new');
  });

  it('a later TERMINATED attempt never hides an earlier legitimate SUBMITTED attempt', () => {
    const submittedEarlier = attempt({
      attemptId: 'legit',
      candidate: 'cand2',
      status: 'SUBMITTED',
      malpracticeStatus: 'NORMAL',
      finalScore: 27,
      durationUsed: 160,
      submittedAt: new Date('2026-01-01T10:00:00Z'),
    });
    const terminatedLater = attempt({
      attemptId: 'bad',
      candidate: 'cand2',
      status: 'TERMINATED',
      malpracticeStatus: 'TERMINATED',
      finalScore: 0,
      durationUsed: 90,
      submittedAt: new Date('2026-01-01T11:00:00Z'),
    });
    const best = latestAttemptPerCandidate([submittedEarlier, terminatedLater]);
    expect(best).toHaveLength(1);
    expect(best[0].attemptId).toBe('legit');
    expect(isRankable(best[0])).toBe(true);
  });

  it('an unrankable candidate still occupies one row using its latest non-rankable attempt', () => {
    const first = attempt({
      attemptId: 't1',
      candidate: 'cand3',
      status: 'TERMINATED',
      malpracticeStatus: 'TERMINATED',
      submittedAt: new Date('2026-01-01T08:00:00Z'),
    });
    const second = attempt({
      attemptId: 't2',
      candidate: 'cand3',
      status: 'TERMINATED',
      malpracticeStatus: 'TERMINATED',
      submittedAt: new Date('2026-01-01T09:00:00Z'),
    });
    const best = latestAttemptPerCandidate([first, second]);
    expect(best).toHaveLength(1);
    expect(best[0].attemptId).toBe('t2');
  });

  it('default sort orders by finalScore DESC then durationUsed ASC', () => {
    const list = [
      attempt({ attemptId: 'd', finalScore: 20, durationUsed: 120 }),
      attempt({ attemptId: 'c', finalScore: 27, durationUsed: 390 }),
      attempt({ attemptId: 'b', finalScore: 27, durationUsed: 250 }),
      attempt({ attemptId: 'a', finalScore: 25, durationUsed: 250 }),
    ];
    const ordered = sortFinalAttempts(list, 'default').map((a) => a.attemptId);
    expect(ordered).toEqual(['b', 'c', 'a', 'd']);
  });

  it('fastest time sort orders by durationUsed ASC', () => {
    const list = [
      attempt({ attemptId: 'slow', durationUsed: 650 }),
      attempt({ attemptId: 'fast', durationUsed: 178 }),
      attempt({ attemptId: 'mid', durationUsed: 195 }),
    ];
    expect(sortFinalAttempts(list, 'time_asc').map((a) => a.attemptId)).toEqual(['fast', 'mid', 'slow']);
  });

  it('toFinalAttempt tolerates negative/undefined duration and maps lean docs', () => {
    const mapped = toFinalAttempt({
      _id: 'x',
      candidate: 'y',
      status: 'TIMED_OUT',
      malpracticeStatus: 'NORMAL',
      finalScore: 10,
      rawScore: 10,
      durationUsed: undefined,
      duration_used: 999,
    } as never);
    expect(mapped.durationUsed).toBe(0);
    expect(mapped.status).toBe('TIMED_OUT');
  });
});