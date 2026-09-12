import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchAttempt,
  fetchQuestions,
  markForReview,
  reportViolation,
  saveAnswer,
  savePosition,
  startExam,
  submitExam,
} from '../../services/examApi';
import { toApiFailure } from '../../services/api';
import { Alert, Button, PageLoader } from '../../components/ui';
import type { AttemptDto, CandidateQuestion, MalpracticeEvent, OptionKey, QuestionsResponse } from '../../types';

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

/** Coalesce blur + visibilitychange + pagehide that fire for ONE physical screen-leave. */
const SCREEN_EXIT_COALESCE_MS = 1500;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Test() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<CandidateQuestion[]>([]);
  const [attempt, setAttempt] = useState<AttemptDto | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey | null>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [remaining, setRemaining] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const expiryRef = useRef<number>(0);
  const submittingRef = useRef(false);
  const lastViolationRef = useRef<{ type: MalpracticeEvent; at: number }>({ type: 'TAB_SWITCH', at: 0 });
  const screenLeaveAtRef = useRef(0);
  const fullscreenActiveRef = useRef(false);
  const lastForbiddenKeyAtRef = useRef(0);

  /* ── boot: resume or start, then load questions ───────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let att: AttemptDto;
        try {
          att = await fetchAttempt();
        } catch {
          att = await startExam();
        }
        const qs: QuestionsResponse = await fetchQuestions();
        if (cancelled) return;
        setAttempt(att);
        expiryRef.current = new Date(att.expiresAt).getTime();
        setRemaining(Math.max(0, Math.floor((expiryRef.current - Date.now()) / 1000)));
        setQuestions(qs.questions);
        const a: Record<string, OptionKey | null> = {};
        const m: Record<string, boolean> = {};
        for (const ans of att.answers) {
          a[ans.question] = ans.selectedAnswer;
          m[ans.question] = ans.markedForReview;
        }
        setAnswers(a);
        setMarked(m);
        const idx = qs.questions.findIndex((q) => q.questionNumber === att.lastQuestionNumber);
        setCurrent(idx >= 0 ? idx : 0);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) {
          setError(toApiFailure(err).message);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── auto submit when time expires ────────────────────── */
  const finalize = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitExam();
    } catch {
      /* already finalized server-side */
    }
    navigate('/submitted', { replace: true });
  }, [navigate]);

  /* ── timer ────────────────────────────────────────────── */
  useEffect(() => {
    if (!loaded || !attempt) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((expiryRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(t);
        void finalize();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [loaded, attempt, finalize]);

  /* ── violation reporting ──────────────────────────────── */
  const reportEvent = useCallback(
    async (type: MalpracticeEvent) => {
      const now = Date.now();
      const duplicate = lastViolationRef.current.type === type && now - lastViolationRef.current.at < 1500;
      lastViolationRef.current = { type, at: now };
      try {
        const res = await reportViolation(type, undefined, { duplicate });
        if (res.terminated) {
          alert(res.message ?? 'Your examination has been terminated.');
          navigate('/submitted', { replace: true });
        } else if (res.message) {
          setBanner(res.message);
          setTimeout(() => setBanner(''), 5000);
        } else if (type === 'EXAM_SCREEN_HIDDEN' || type === 'WINDOW_BLUR') {
          setBanner('Examination screen was left.');
          setTimeout(() => setBanner(''), 5000);
        } else if (type === 'TAB_SWITCH' || type === 'FULLSCREEN_EXIT') {
          setBanner(
            `Warning: ${type === 'TAB_SWITCH' ? 'tab switch' : 'leaving fullscreen'} recorded (violation ${res.violationCount ?? '—'}).`,
          );
          setTimeout(() => setBanner(''), 5000);
        }
      } catch {
        /* best effort */
      }
    },
    [navigate],
  );

  /* ── anti-cheat listeners ─────────────────────────────── */
  useEffect(() => {
    if (!loaded) return;

    /* Handles the FIRST screen-leave signal (blur/hidden/pagehide/fullscreen-exit).
       Further signals from the same physical action are ignored within 1.5s. */
    const consumeScreenLeave = (): boolean => {
      const now = Date.now();
      if (now - screenLeaveAtRef.current < SCREEN_EXIT_COALESCE_MS) return false;
      screenLeaveAtRef.current = now;
      return true;
    };

    const onVisibility = () => {
      if (document.hidden && consumeScreenLeave()) void reportEvent('EXAM_SCREEN_HIDDEN');
    };
    const onBlur = () => {
      if (consumeScreenLeave()) void reportEvent('WINDOW_BLUR');
    };
    const onPageHide = () => {
      if (consumeScreenLeave()) void reportEvent('EXAM_SCREEN_HIDDEN');
    };
    const onFullscreenChange = () => {
      const wasFullscreen = fullscreenActiveRef.current;
      fullscreenActiveRef.current = Boolean(document.fullscreenElement);
      if (wasFullscreen && !document.fullscreenElement && consumeScreenLeave()) {
        void reportEvent('FULLSCREEN_EXIT');
      }
    };
    const onPopState = () => {
      window.history.pushState(null, '', window.location.href);
      void reportEvent('NAVIGATION_ATTEMPT');
    };
    const onSelectStart = (e: Event) => e.preventDefault();
    const onContextMenu = (e: Event) => {
      e.preventDefault();
      void reportEvent('CONTEXT_MENU_ATTEMPT');
    };
    /* Ctrl+C/V/X triggers keydown AND a copy/paste/cut event for one keypress —
       skip the cloned event so one physical action counts once. */
    const onCopy = (e: Event) => {
      if (Date.now() - lastForbiddenKeyAtRef.current < SCREEN_EXIT_COALESCE_MS) return;
      e.preventDefault();
      void reportEvent('COPY_ATTEMPT');
    };
    const onPaste = (e: Event) => {
      if (Date.now() - lastForbiddenKeyAtRef.current < SCREEN_EXIT_COALESCE_MS) return;
      e.preventDefault();
      void reportEvent('PASTE_ATTEMPT');
    };
    const onCut = (e: Event) => {
      if (Date.now() - lastForbiddenKeyAtRef.current < SCREEN_EXIT_COALESCE_MS) return;
      e.preventDefault();
      void reportEvent('CUT_ATTEMPT');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const restricted =
        ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'u', 'p', 's', 'r'].includes(k)) ||
        k === 'f12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(k));
      if (!restricted) {
        if (k === 'f5') e.preventDefault();
        return;
      }
      if (e.repeat) return; /* held key: count once */
      e.preventDefault();
      lastForbiddenKeyAtRef.current = Date.now();
      void reportEvent('SHORTCUT_ATTEMPT');
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('selectstart', onSelectStart);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('cut', onCut);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('selectstart', onSelectStart);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [loaded, reportEvent]);

  /* ── answer selection with auto-save ──────────────────── */
  async function choose(question: CandidateQuestion, key: OptionKey | null) {
    const prev = answers[question._id] ?? null;
    if (prev === key && key !== null) return;
    setAnswers((a) => ({ ...a, [question._id]: key }));
    setSaveState('saving');
    try {
      await saveAnswer(question._id, key, question.questionNumber, key === null);
      setSaveState('saved');
    } catch {
      setAnswers((a) => ({ ...a, [question._id]: prev }));
      setSaveState('error');
    }
  }

  async function toggleMark(question: CandidateQuestion) {
    const next = !marked[question._id];
    setMarked((m) => ({ ...m, [question._id]: next }));
    try {
      await markForReview(question._id, next);
    } catch {
      /* best effort */
    }
  }

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(questions.length - 1, index));
    const q = questions[clamped];
    setCurrent(clamped);
    setShowPalette(false);
    if (q) void savePosition(q.questionNumber).catch(() => undefined);
  }

  async function handleSubmit() {
    setSubmitting(true);
    await finalize();
  }

  /* ── render ───────────────────────────────────────────── */
  if (!loaded) return <PageLoader label="Preparing your examination…" />;

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Alert>{error}</Alert>
        <Button className="mt-4 w-full" onClick={() => navigate('/instructions', { replace: true })}>
          Back to instructions
        </Button>
      </div>
    );
  }

  const q = questions[current];
  const answeredCount = Object.values(answers).filter((v) => v !== null && v !== undefined).length;
  const lowTime = remaining <= 300;

  return (
    <div className="flex min-h-screen flex-col no-select">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">SWAP 2K26 Examination</p>
            <p className="text-xs text-slate-400">
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && '✓ All answers saved'}
              {saveState === 'error' && <span className="text-rose-500">Save failed — retry by re-selecting</span>}
              {saveState === 'idle' && 'Answers auto-save'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${
                lowTime ? 'animate-pulse bg-rose-100 text-rose-700' : 'bg-brand-50 text-brand-700'
              }`}
            >
              {fmt(remaining)}
            </div>
            <Button variant="secondary" className="hidden sm:inline-flex" onClick={() => setShowPalette((v) => !v)}>
              Palette
            </Button>
          </div>
        </div>
      </header>

      {banner && (
        <div className="px-4 pt-3">
          <div className="mx-auto max-w-3xl">
            <Alert kind="warn">{banner}</Alert>
          </div>
        </div>
      )}

      {/* question */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        {q && (
          <div className="animate-fade-in rounded-xl bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
                Question {current + 1} of {questions.length}
              </span>
              <button
                className={`text-xs font-semibold ${marked[q._id] ? 'text-purple-600' : 'text-slate-400'}`}
                onClick={() => toggleMark(q)}
              >
                {marked[q._id] ? '★ Marked for review' : '☆ Mark for review'}
              </button>
            </div>
            <p className="mb-4 text-[15px] font-medium leading-relaxed text-slate-800">{q.question}</p>
            <div className="space-y-2.5">
              {OPTION_KEYS.map((key) => {
                const selected = answers[q._id] === key;
                return (
                  <button
                    key={key}
                    onClick={() => choose(q, key)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition active:scale-[0.99] ${
                      selected
                        ? 'border-brand-500 bg-brand-50 font-semibold text-brand-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {key}
                    </span>
                    {q.options[key]}
                  </button>
                );
              })}
            </div>
            {answers[q._id] !== null && answers[q._id] !== undefined && (
              <button className="mt-3 text-xs font-semibold text-rose-500" onClick={() => choose(q, null)}>
                Clear response
              </button>
            )}
          </div>
        )}
      </main>

      {/* navigation */}
      <footer className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <Button variant="secondary" disabled={current === 0} onClick={() => goTo(current - 1)}>
            ← Prev
          </Button>
          <div className="flex items-center gap-2">
            <button className="text-xs font-semibold text-brand-600 sm:hidden" onClick={() => setShowPalette(true)}>
              {answeredCount}/{questions.length} answered
            </button>
            {current < questions.length - 1 ? (
              <Button onClick={() => goTo(current + 1)}>Next →</Button>
            ) : (
              <Button variant="success" onClick={() => setConfirmSubmit(true)}>
                Submit Test
              </Button>
            )}
          </div>
        </div>
      </footer>

      {/* palette drawer (mobile) */}
      {showPalette && (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-900/50" onClick={() => setShowPalette(false)}>
          <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Question palette</h3>
              <div className="flex gap-3 text-[11px] text-slate-500">
                <span>🟩 {answeredCount} answered</span>
                <span>⬜ {questions.length - answeredCount} left</span>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
              {questions.map((item, i) => {
                const isAnswered = answers[item._id] != null;
                const isMarked = marked[item._id];
                const isCurrent = i === current;
                return (
                  <button
                    key={item._id}
                    onClick={() => goTo(i)}
                    className={`h-9 w-9 rounded-lg text-xs font-bold transition ${isCurrent ? 'ring-2 ring-brand-500 ring-offset-1' : ''} ${
                      isMarked
                        ? 'bg-purple-200 text-purple-800'
                        : isAnswered
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <Button
              variant="success"
              className="mt-5 w-full"
              onClick={() => {
                setShowPalette(false);
                setConfirmSubmit(true);
              }}
            >
              Submit Test
            </Button>
          </div>
        </div>
      )}

      {/* confirm dialog */}
      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-800">Submit test?</h3>
            <p className="mt-2 text-sm text-slate-500">
              You answered <b>{answeredCount}</b> of <b>{questions.length}</b> questions. Submission is final — you cannot
              return to the test.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmSubmit(false)} disabled={submitting}>
                Keep writing
              </Button>
              <Button variant="success" className="flex-1" loading={submitting} onClick={handleSubmit}>
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
