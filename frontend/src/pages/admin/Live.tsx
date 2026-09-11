import { useEffect, useState } from 'react';
import { getLiveStatus } from '../../services/adminApi';
import { toApiFailure } from '../../services/api';
import { Alert, Badge, Card, PageLoader } from '../../components/ui';
import type { LiveResponse } from '../../types';

export default function Live() {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const tick = async () => {
      try {
        const d = await getLiveStatus();
        setData(d);
        setUpdatedAt(new Date());
        setError('');
      } catch (e) {
        setError(toApiFailure(e).message);
      }
    };
    void tick();
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
  }, []);

  if (!data && !error) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-slate-800">
          Live monitor <Badge kind="green">{data?.count ?? 0} active</Badge>
        </h1>
        <span className="text-xs text-slate-400">refreshes every 10s{updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ''}</span>
      </div>
      {error && <Alert>{error}</Alert>}

      {!data || data.live.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-slate-400">No candidates are writing the exam right now.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.live.map((row) => {
            const urgent = row.remainingSeconds <= 300;
            return (
              <Card key={row.attemptId} className="!p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-slate-800">{row.name}</p>
                    <p className="font-mono text-xs text-brand-600">{row.uid}</p>
                  </div>
                  <span className={`rounded-lg px-2.5 py-1 font-mono text-lg font-bold tabular-nums ${urgent ? 'animate-pulse bg-rose-100 text-rose-700' : 'bg-brand-50 text-brand-700'}`}>
                    {Math.floor(row.remainingSeconds / 60)}:{String(row.remainingSeconds % 60).padStart(2, '0')}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{row.answeredCount} answered</span>
                  <span>·</span>
                  <span className={row.violationCount > 0 ? 'font-semibold text-rose-500' : ''}>{row.violationCount} violations</span>
                  {row.malpracticeStatus !== 'NORMAL' && <Badge kind="amber">{row.malpracticeStatus}</Badge>}
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${urgent ? 'bg-rose-500' : 'bg-brand-500'}`}
                    style={{ width: `${Math.min(100, (row.answeredCount / Math.max(1, row.answeredCount + 1)) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-400">Started {new Date(row.startedAt).toLocaleTimeString()}</p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}