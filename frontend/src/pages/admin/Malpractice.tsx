import { useCallback, useEffect, useState } from 'react';
import { listMalpractice, resetMalpracticeList, updateMalpractice } from '../../services/adminApi';
import { toApiFailure } from '../../services/api';
import { Alert, Badge, Button, Card, EmptyState, Input, Modal, PageLoader } from '../../components/ui';
import { fmtDateTime } from '../../utils/cn';
import type { MalpracticeLogRow } from '../../types';

const severityBadge = (s: 'MAJOR' | 'MINOR') => (s === 'MAJOR' ? <Badge kind="red">{s}</Badge> : <Badge kind="slate">{s}</Badge>);

export default function Malpractice() {
  const [rows, setRows] = useState<MalpracticeLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const data = await listMalpractice({ page: p, limit: 25 });
      setRows(data.logs);
      setTotal(data.total);
      setPages(data.totalPages);
      setError('');
    } catch (e) {
      setError(toApiFailure(e).message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(attemptId: string, action: 'CONFIRM' | 'CLEAR' | 'TERMINATE', label: string) {
    if (!confirm(`${label} this attempt?`)) return;
    try {
      await updateMalpractice(attemptId, action);
      setNotice(`Action "${label}" applied to attempt.`);
      await load();
    } catch (e) {
      setError(toApiFailure(e).message);
    }
  }

  async function handleResetList() {
    if (resetConfirm !== 'RESET MALPRACTICE') return;
    setResetting(true);
    setError('');
    try {
      await resetMalpracticeList();
      setResetModalOpen(false);
      setResetConfirm('');
      setNotice('Malpractice list reset successfully.');
      await load(1);
    } catch (e) {
      setError(toApiFailure(e).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-slate-800">
          Malpractice log <span className="text-sm font-medium text-slate-400">({total})</span>
        </h1>
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => setResetModalOpen(true)}>
            Reset Malpractice List
          </Button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <Card className="!p-0">
        {loading ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState title="No malpractice events recorded" hint="Violations reported by candidates appear here in real time." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Q#</th>
                  <th className="px-4 py-3">User agent</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((log) => {
                  const attemptId = typeof log.attempt === 'string' ? log.attempt : log.attempt?._id;
                  const name = log.candidate?.name ?? 'Unknown';
                  const uid = log.candidate?.uid ?? '—';
                  return (
                    <tr key={log._id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtDateTime(log.timestamp)}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-700">{name}</p>
                        <p className="font-mono text-[11px] text-brand-600">{uid}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-700">{log.eventType.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3">{severityBadge(log.severity)}</td>
                      <td className="px-4 py-3 text-xs">{log.questionNumber ?? '—'}</td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-[11px] text-slate-400">{log.userAgent || '—'}</td>
                      <td className="px-4 py-3">
                        {attemptId ? (
                          <div className="flex gap-1 text-xs font-semibold">
                            <button className="rounded px-2 py-1 text-rose-500 hover:bg-rose-50" onClick={() => act(attemptId, 'TERMINATE', 'Terminate')}>
                              Terminate
                            </button>
                            <button className="rounded px-2 py-1 text-amber-600 hover:bg-amber-50" onClick={() => act(attemptId, 'CONFIRM', 'Confirm malpractice')}>
                              Confirm
                            </button>
                            <button className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={() => act(attemptId, 'CLEAR', 'Clear flags')}>
                              Clear
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 p-3 text-sm">
            <Button variant="secondary" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); void load(p); }}>← Prev</Button>
            <span className="text-slate-500">Page {page} / {pages}</span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); void load(p); }}>Next →</Button>
          </div>
        )}
      </Card>

      {resetModalOpen && (
        <Modal title="RESET MALPRACTICE LIST?" onClose={() => !resetting && setResetModalOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              This will clear all current malpractice records and violation flags.
              <br />
              <b>This action cannot be undone.</b>
            </div>
            <p className="text-sm text-slate-600">
              Type <b>RESET MALPRACTICE</b> to confirm.
            </p>
            <Input
              value={resetConfirm}
              placeholder="RESET MALPRACTICE"
              onChange={(e) => setResetConfirm(e.target.value)}
              autoCapitalize="characters"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setResetModalOpen(false)} disabled={resetting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={resetting}
                disabled={resetConfirm !== 'RESET MALPRACTICE'}
                onClick={handleResetList}
              >
                Reset Malpractice List
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}