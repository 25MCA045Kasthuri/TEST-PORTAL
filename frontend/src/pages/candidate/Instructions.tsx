import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExamStatus, logout } from '../../services/examApi';
import { toApiFailure } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Button, Card, PageLoader } from '../../components/ui';
import type { ExamStatus } from '../../types';

export default function Instructions() {
  const [status, setStatus] = useState<ExamStatus | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    getExamStatus()
      .then(setStatus)
      .catch((err) => setError(toApiFailure(err).message));
  }, []);

  async function handleStart() {
    setStarting(true);
    setError('');
    try {
      await getExamStatus();
      navigate('/test', { replace: true });
    } catch (err) {
      setError(toApiFailure(err).message);
      setStarting(false);
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    navigate('/login', { replace: true });
  }

  if (!status && !error) return <PageLoader label="Loading instructions…" />;

  const state = status?.state ?? 'NOT_STARTED';

  const rules = [
    'This test contains the questions configured by your examination administrator.',
    `Duration: ${status?.durationMinutes ?? 60} minutes. The timer starts the moment you press "Start Test" and cannot be paused.`,
    'Your answers are auto-saved after every selection. An active internet connection is required.',
    'Do not switch tabs, leave fullscreen, or use copy/paste — every violation is recorded.',
    status?.fullScreenRequired
      ? 'Fullscreen mode is mandatory. Exiting fullscreen is treated as a serious violation and may terminate your test.'
      : 'Leaving the exam window is tracked; repeated violations may terminate your test.',
    'Press "Submit Test" when you are done. The test is submitted automatically when time expires.',
    'If your test is terminated for malpractice, your score will be invalidated.',
  ];

  return (
    <div className="mx-auto min-h-screen max-w-2xl p-4 no-select">
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-xl font-black text-slate-800">{status?.examTitle ?? 'SWAP 2K26 Examination'}</h1>
          <p className="text-xs text-slate-500">Read the instructions carefully before starting</p>
        </div>
        <Button variant="ghost" onClick={handleLogout}>
          Logout
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}

      {state === 'ACTIVE' && (
        <Alert kind="warn">
          You already have an exam in progress. Click below to resume — your previous answers are saved.
        </Alert>
      )}
      {(state === 'SUBMITTED' || state === 'TIMED_OUT' || state === 'TERMINATED') && (
        <Alert kind="info">
          Your test is already complete ({state.toLowerCase()}). Contact the administrator if this is unexpected.
        </Alert>
      )}

      <Card className="mt-4">
        <h2 className="mb-3 font-bold text-slate-700">Instructions</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
          {rules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ol>

        <label className="mt-5 flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span>I have read and understood all instructions. I agree that violations may lead to termination.</span>
        </label>

        <Button
          className="mt-4 w-full"
          disabled={!accepted || state === 'SUBMITTED' || state === 'TIMED_OUT' || state === 'TERMINATED' || !status?.examEnabled}
          loading={starting}
          onClick={handleStart}
        >
          {state === 'ACTIVE' ? 'Resume Test' : 'Start Test'}
        </Button>
        {status && !status.examEnabled && (
          <p className="mt-2 text-center text-xs text-rose-500">The examination is currently disabled by the administrator.</p>
        )}
      </Card>
    </div>
  );
}