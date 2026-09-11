import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { examStatusTyped, logout } from '../../services/examApi';
import { toApiFailure } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Badge, Button, Card, PageLoader } from '../../components/ui';
import type { ExamStatus } from '../../types';

export default function Submitted() {
  const [status, setStatus] = useState<ExamStatus | null>(null);
  const [error, setError] = useState('');
  const { setUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    examStatusTyped()
      .then(setStatus)
      .catch((err) => setError(toApiFailure(err).message));
  }, []);

  async function handleLogout() {
    await logout();
    setUser(null);
    navigate('/login', { replace: true });
  }

  if (!status && !error) return <PageLoader label="Fetching your result…" />;

  const state = status?.state ?? 'SUBMITTED';
  const attempt = status?.attempt;
  const done = state === 'SUBMITTED' || state === 'TIMED_OUT' || state === 'TERMINATED';

  const heading =
    state === 'TERMINATED'
      ? 'Test terminated'
      : state === 'TIMED_OUT'
        ? 'Time expired — test auto-submitted'
        : state === 'SUBMITTED'
          ? 'Test submitted successfully'
          : 'Test in progress';

  const tone =
    state === 'TERMINATED' ? 'red' : state === 'SUBMITTED' ? 'green' : state === 'TIMED_OUT' ? 'amber' : 'blue';

  return (
    <div className="flex min-h-screen items-center justify-center p-4 no-select">
      <div className="w-full max-w-md animate-fade-in space-y-4">
        {error && <Alert>{error}</Alert>}
        {status && (
          <Card className="text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-3xl">
              {state === 'TERMINATED' ? '🚫' : state === 'SUBMITTED' ? '✅' : '⏱️'}
            </div>
            <h1 className="text-xl font-black text-slate-800">{heading}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {status.examTitle} ·{' '}
              <Badge kind={tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : tone === 'green' ? 'green' : 'blue'}>
                {state.replace('_', ' ')}
              </Badge>
            </p>

            {done && attempt && (
              <div className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
                {typeof attempt.rawScore === 'number' ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Raw score</span>
                      <b>{attempt.rawScore}</b>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Final score</span>
                      <b>{state === 'TERMINATED' ? 0 : attempt.rawScore}</b>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-500">
                    Your official score will be published by the examination administrator after review.
                  </p>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Violations recorded</span>
                  <b>{attempt.violationCount ?? 0}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <b className={state === 'TERMINATED' ? 'text-rose-600' : 'text-slate-700'}>
                    {attempt.malpracticeStatus ?? state}
                  </b>
                </div>
              </div>
            )}

            {state === 'ACTIVE' && (
              <>
                <Alert kind="warn">Your test is still active.</Alert>
                <Button className="mt-4 w-full" onClick={() => navigate('/test', { replace: true })}>
                  Return to test
                </Button>
              </>
            )}

            {done && (
              <Button variant="secondary" className="mt-5 w-full" onClick={handleLogout}>
                Log out
              </Button>
            )}
          </Card>
        )}
        <p className="text-center text-xs text-slate-400">Thank you for participating in SWAP 2K26.</p>
      </div>
    </div>
  );
}