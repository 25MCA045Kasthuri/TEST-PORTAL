import { useEffect, useState } from 'react';
import { getDashboard, getLiveStatus } from '../../services/adminApi';
import { toApiFailure } from '../../services/api';
import { Alert, Badge, Card, PageLoader, StatCard } from '../../components/ui';
import type { DashboardData, LiveResponse } from '../../types';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => {
      getDashboard().then(setData).catch((e) => setError(toApiFailure(e).message));
      getLiveStatus().then(setLive).catch(() => undefined);
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800">{data.settings.examTitle}</h1>
          <p className="text-sm text-slate-500">
            {data.settings.durationMinutes} min · {data.settings.totalQuestions} questions ·{' '}
            {data.settings.examEnabled ? <Badge kind="green">Exam enabled</Badge> : <Badge kind="red">Exam disabled</Badge>}
          </p>
        </div>
        <Badge kind="blue">{live?.count ?? 0} writing now</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Registered" value={data.registeredCandidates} tone="blue" />
        <StatCard label="Not started" value={data.notStarted} tone="slate" />
        <StatCard label="Writing now" value={data.currentlyWriting} tone="green" />
        <StatCard label="Completed" value={data.completed} tone="blue" />
        <StatCard label="Malpractice flags" value={data.malpracticeFlags} tone="amber" />
        <StatCard label="Terminated" value={data.terminatedSessions} tone="red" />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-slate-700">Live monitor</h2>
          <span className="text-xs text-slate-400">auto-refresh 15s</span>
        </div>
        {!live || live.live.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No active sessions right now.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {live.live.map((row) => (
              <div key={row.attemptId} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-semibold text-slate-700">
                    {row.name} <span className="text-xs font-normal text-slate-400">({row.uid})</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {row.answeredCount} answered · {row.violationCount} violations
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.malpracticeStatus !== 'NORMAL' && <Badge kind="amber">{row.malpracticeStatus}</Badge>}
                  <span className="font-mono text-sm font-bold text-brand-700">
                    {Math.floor(row.remainingSeconds / 60)}:{String(row.remainingSeconds % 60).padStart(2, '0')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}