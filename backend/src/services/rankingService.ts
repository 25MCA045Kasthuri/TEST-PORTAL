/**
 * Exam ranking helpers.
 *
 * Official ranking is computed from backend/database values only:
 *   PRIMARY sort   -> finalScore DESC
 *   TIE-BREAKER    -> durationUsed ASC (faster candidate ranks higher)
 *
 * Ranks use standard competition ranking ("1224" style): candidates with an
 * identical (finalScore, durationUsed) pair share the same rank and the next
 * rank is skipped.
 */

export type ResultSortKey = 'default' | 'score_desc' | 'score_asc' | 'time_asc' | 'time_desc';

export interface FinalAttempt {
  attemptId: string;
  candidate: string;
  status: string;
  malpracticeStatus: string;
  finalScore: number;
  rawScore: number;
  durationUsed: number;
  correct: number;
  wrong: number;
  unanswered: number;
  violationCount: number;
  startedAt?: Date | string | null;
  submittedAt?: Date | string | null;
}

interface RawAttempt {
  _id: unknown;
  candidate: unknown;
  status?: string;
  malpracticeStatus?: string;
  finalScore?: number;
  rawScore?: number;
  durationUsed?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  unanswered?: number;
  violationCount?: number;
  startedAt?: Date | string | null;
  submittedAt?: Date | string | null;
}

/** Maps a raw (lean) ExamAttempt document to the subset used for ranking/display. */
export function toFinalAttempt(a: RawAttempt): FinalAttempt {
  return {
    attemptId: String(a._id),
    candidate: String(a.candidate),
    status: a.status ?? 'SUBMITTED',
    malpracticeStatus: a.malpracticeStatus ?? 'NORMAL',
    finalScore: a.finalScore ?? 0,
    rawScore: a.rawScore ?? 0,
    durationUsed: a.durationUsed ?? 0,
    correct: a.correctAnswers ?? 0,
    wrong: a.wrongAnswers ?? 0,
    unanswered: a.unanswered ?? 0,
    violationCount: a.violationCount ?? 0,
    startedAt: a.startedAt ?? null,
    submittedAt: a.submittedAt ?? null,
  };
}

/** An attempt is eligible for an official rank when it completed normally and no malpractice was confirmed. */
export function isRankable(a: FinalAttempt): boolean {
  return (a.status === 'SUBMITTED' || a.status === 'TIMED_OUT') && a.malpracticeStatus !== 'CONFIRMED';
}

/**
 * Picks a single finalized attempt per candidate so that every candidate
 * occupies exactly one official position. Historical attempts are preserved in
 * the database but never appear as separate ranked rows.
 *
 * Preference order:
 *   1. A rankable attempt (SUBMITTED / TIMED_OUT, not CONFIRMED malpractice) is
 *      always preferred over a non-rankable one (TERMINATED / CONFIRMED), so a
 *      later invalidated attempt never hides a candidate's legitimate result.
 *   2. Among attempts of the same kind, the latest one (by submittedAt) wins.
 */
export function latestAttemptPerCandidate(attempts: FinalAttempt[]): FinalAttempt[] {
  const best = new Map<string, FinalAttempt>();
  for (const a of attempts) {
    const existing = best.get(a.candidate);
    if (!existing || attemptsPreference(a, existing) > 0) {
      best.set(a.candidate, a);
    }
  }
  return [...best.values()];
}

function attemptsPreference(a: FinalAttempt, b: FinalAttempt): number {
  const aRankable = isRankable(a) ? 1 : 0;
  const bRankable = isRankable(b) ? 1 : 0;
  if (aRankable !== bRankable) return aRankable - bRankable;
  return timeMs(a.submittedAt) - timeMs(b.submittedAt);
}

function timeMs(value?: Date | string | null): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function byScoreThenTime(a: FinalAttempt, b: FinalAttempt): number {
  return b.finalScore - a.finalScore || a.durationUsed - b.durationUsed;
}

/** Competition ranking over an already score/time-sorted eligible list. Returns attemptId -> rank (1-based). */
export function computeRanks(sorted: FinalAttempt[]): Map<string, number> {
  const ranks = new Map<string, number>();
  sorted.forEach((a, i) => {
    if (i > 0 && a.finalScore === sorted[i - 1].finalScore && a.durationUsed === sorted[i - 1].durationUsed) {
      ranks.set(a.attemptId, ranks.get(sorted[i - 1].attemptId) as number);
    } else {
      ranks.set(a.attemptId, i + 1);
    }
  });
  return ranks;
}

/** Applies the Sort By control. Only re-orders the list; it never changes rank values. */
export function sortFinalAttempts(attempts: FinalAttempt[], sort: ResultSortKey): FinalAttempt[] {
  const arr = [...attempts];
  switch (sort) {
    case 'score_asc':
      return arr.sort((a, b) => a.finalScore - b.finalScore || a.durationUsed - b.durationUsed);
    case 'time_asc':
      return arr.sort((a, b) => a.durationUsed - b.durationUsed || b.finalScore - a.finalScore);
    case 'time_desc':
      return arr.sort((a, b) => b.durationUsed - a.durationUsed || b.finalScore - a.finalScore);
    case 'score_desc':
    case 'default':
    default:
      return arr.sort(byScoreThenTime);
  }
}