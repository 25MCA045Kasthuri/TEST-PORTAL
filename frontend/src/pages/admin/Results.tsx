import { useCallback, useEffect, useState } from 'react';
import { exportResultsUrl, listResults, type ResultsSortKey } from '../../services/adminApi';
import { toApiFailure } from '../../services/api';
import { Alert, Badge, Button, Card, EmptyState, Input, PageLoader, Select, StatCard } from '../../components/ui';
import { fmtDateTime, fmtSeconds } from '../../utils/cn';
import type { MalpracticeStatus, ResultsSummary, ResultRow } from '../../types';

const malpracticeBadge = (s: MalpracticeStatus) => {
  if (s === 'CONFIRMED' || s === 'TERMINATED') return <Badge kind="red">{s}</Badge>;
  if (s === 'SUSPECTED' || s === 'WARNING') return <Badge kind="amber">{s}</Badge>;
  return <Badge kind="slate">{s}</Badge>;
};

const rankCell = (rank: number | null) => {
  if (rank === null) return <span className="text-slate-300">—</span>;
  const medal = rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : '';
  const tone =
    rank === 1 ? 'text-amber-600' : rank === 2 ? 'text-slate-500' : rank === 3 ? 'text-orange-700' : 'text-slate-700';
  return (
    <span className={`font-mono text-xs font-bold ${tone}`}>
      {medal}#{rank}
    </span>
  );
};

const summaryCards = (s: ResultsSummary | null) => [
  { label: 'Total registered', value: s?.totalRegistered ?? 0, tone: 'blue' as const },
  { label: 'Attended', value: s?.attended ?? 0, tone: 'slate' as const },
  { label: 'Submitted', value: s?.submitted ?? 0, tone: 'green' as const },
  {
    label: 'Top score',
    value: s ? `${s.topScore} / ${s.topScoreMax}` : '0 / 0',
    tone: 'amber' as const,
  },
];

export default function Results() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [summary, setSummary] = useState<ResultsSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<ResultsSortKey>('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (p = page, s = search, st = status, so = sort) => {
      setLoading(true);
      try {
        const data = await listResults({
          page: p,
          limit: 20,
          search: s || undefined,
          status: st || undefined,
          sort: so,
        });
        setRows(data.results);
        setTotal(data.total);
        setPages(data.totalPages);
        setSummary(data.summary);
        setError('');
      } catch (e) {
        setError(toApiFailure(e).message);
      } finally {
        setLoading(false);
      }
    },
    [page, search, status, sort],
  );

  useEffect(() => {
    void load(1, '', '', 'default');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    await load(1, search, status, sort);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800">
            Results <span className="text-sm font-medium text-slate-400">({total})</span>
          </h1>
          <p className="text-xs text-slate-400">
            {total} participant{total === 1 ? '' : 's'} shown
          </p>
        </div>
        <a href={exportResultsUrl}>
          <Button variant="success">⬇ Export Excel</Button>
        </a>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards(summary).map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} tone={c.tone} />
        ))}
      </div>

      <Card className="!p-0">
        <form onSubmit={handleFilter} className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Input
            placeholder="Search UID / name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!py-2 sm:!w-56"
          />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!py-2">
            <option value="">All statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="TIMED_OUT">Timed out</option>
            <option value="TERMINATED">Terminated</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as ResultsSortKey)} className="!py-2">
            <option value="default">Sort: Default</option>
            <option value="score_desc">Final Score: High to Low</option>
            <option value="score_asc">Final Score: Low to High</option>
            <option value="time_asc">Fastest Time</option>
            <option value="time_desc">Slowest Time</option>
          </Select>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>

        {loading ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState title="No results yet" hint="Results appear here once candidates submit their tests." />
        ) : (
          <>
            <p className="px-4 pt-3 text-xs text-slate-400">
              Ranking rules: higher Final Score wins; equal scores are ranked by faster time. C = Correct · W = Wrong ·
              U = Unanswered
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">UID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3" title="C = Correct · W = Wrong · U = Unanswered">C / W / U</th>
                    <th className="px-4 py-3">Raw</th>
                    <th className="px-4 py-3">Final</th>
                    <th className="px-4 py-3">Viol.</th>
                    <th className="px-4 py-3">Malpractice</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r) => (
                    <tr key={r.attemptId} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">{rankCell(r.rank)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-brand-700">{r.uid}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{r.name}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="text-emerald-600">{r.correct}</span> /{' '}
                        <span className="text-rose-500">{r.wrong}</span> /{' '}
                        <span className="text-slate-400">{r.unanswered}</span>
                      </td>
                      <td className="px-4 py-3">{r.rawScore}</td>
                      <td className="px-4 py-3 font-bold">{r.finalScore}</td>
                      <td className="px-4 py-3">{r.violationCount}</td>
                      <td className="px-4 py-3">{malpracticeBadge(r.malpracticeStatus)}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.status === 'TERMINATED' ? (
                          <Badge kind="red">TERMINATED</Badge>
                        ) : r.status === 'TIMED_OUT' ? (
                          <Badge kind="amber">TIMED OUT</Badge>
                        ) : (
                          <Badge kind="blue">SUBMITTED</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtDateTime(r.submittedAt)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtSeconds(r.durationUsed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 p-3 text-sm">
            <Button variant="secondary" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); void load(p); }}>← Prev</Button>
            <span className="text-slate-500">Page {page} / {pages}</span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); void load(p); }}>Next →</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
