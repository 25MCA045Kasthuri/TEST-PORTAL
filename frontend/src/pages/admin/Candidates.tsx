import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createCandidate,
  deleteCandidate,
  importCandidates,
  listCandidates,
  resetCandidatePassword,
  resetCandidateList,
  updateCandidate,
} from '../../services/adminApi';
import { toApiFailure } from '../../services/api';
import { Alert, Badge, Button, Card, EmptyState, Input, Modal, PageLoader } from '../../components/ui';
import type { AdminCandidate, CandidateImportResult } from '../../types';

const emptyForm = { uid: '', name: '', mobile: '', college: '', department: '' };

export default function Candidates() {
  const [rows, setRows] = useState<AdminCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [modal, setModal] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editing, setEditing] = useState<AdminCandidate | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [importResult, setImportResult] = useState<CandidateImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(
    async (p = page, s = search) => {
      setLoading(true);
      try {
        const data = await listCandidates({ page: p, limit: 20, search: s || undefined });
        setRows(data.candidates);
        setTotal(data.total);
        setPages(data.totalPages);
        setError('');
      } catch (e) {
        setError(toApiFailure(e).message);
      } finally {
        setLoading(false);
      }
    },
    [page, search],
  );

  useEffect(() => {
    void load(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    await load(1, search);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditing(null);
    setModal('create');
  }

  function openEdit(c: AdminCandidate) {
    setEditing(c);
    setForm({ uid: c.uid, name: c.name, mobile: c.mobile, college: c.college ?? '', department: c.department ?? '' });
    setModal('edit');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateCandidate(editing._id, {
          name: form.name,
          mobile: form.mobile,
          college: form.college,
          department: form.department,
        });
        setNotice('Candidate updated.');
      } else {
        const created = await createCandidate(form);
        setNotice(
          `Candidate ${form.uid.toUpperCase()} created. Default password: ${created?.defaultPassword ?? 'Jmc + last 4 digits of UID'}.`,
        );
      }
      setModal('closed');
      await load(1, '');
    } catch (e) {
      setError(toApiFailure(e).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: AdminCandidate) {
    if (!confirm(`Delete ${c.name} (${c.uid}) and all their attempt data?`)) return;
    try {
      await deleteCandidate(c._id);
      setNotice('Candidate deleted.');
      await load();
    } catch (e) {
      setError(toApiFailure(e).message);
    }
  }

  async function handleReset(c: AdminCandidate) {
    if (!confirm(`Reset password of ${c.name} to the default (Jmc + last 4 digits of UID)?`)) return;
    try {
      const result = await resetCandidatePassword(c._id);
      setNotice(
        `Password reset successfully. Default password: ${result?.defaultPassword ?? 'Jmc + last 4 digits of UID'}.`,
      );
    } catch (e) {
      setError(toApiFailure(e).message);
    }
  }

  async function handleImportFile(file: File) {
    setError('');
    setNotice('');
    try {
      const result = await importCandidates(file);
      setImportResult(result);
      setNotice(`${result.successful} candidate(s) imported.`);
      await load(1, '');
    } catch (e) {
      setError(toApiFailure(e).message);
    }
  }

  async function handleResetList() {
    if (resetConfirm !== 'RESET CANDIDATES') return;
    setResetting(true);
    setError('');
    try {
      await resetCandidateList();
      setResetModalOpen(false);
      setResetConfirm('');
      setNotice('Candidate list reset successfully.');
      await load(1, '');
    } catch (e) {
      setError(toApiFailure(e).message);
    } finally {
      setResetting(false);
    }
  }

  const statusBadge = (c: AdminCandidate) => {
    if (c.examStatus === 'ACTIVE') return <Badge kind="green">Writing</Badge>;
    if (c.examStatus === 'SUBMITTED') return <Badge kind="blue">Submitted</Badge>;
    if (c.examStatus === 'TIMED_OUT') return <Badge kind="amber">Timed out</Badge>;
    if (c.examStatus === 'TERMINATED') return <Badge kind="red">Terminated</Badge>;
    return <Badge kind="slate">Not started</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-slate-800">
          Candidates <span className="text-sm font-medium text-slate-400">({total})</span>
        </h1>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = '';
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import Excel
          </Button>
          <Button onClick={openCreate}>+ Add candidate</Button>
          <Button variant="danger" onClick={() => setResetModalOpen(true)}>
            Reset Candidate List
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      <p className="text-xs text-slate-500">
        Default candidate password format: <b>Jmc</b> + last four digits of UID. Example: SWAP2K260001 → Jmc0001.
      </p>
      {importResult && importResult.failed.length > 0 && (
        <Card>
          <h3 className="mb-2 font-bold text-slate-700">Import issues</h3>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
            {importResult.failed.map((f) => (
              <li key={`${f.row}-${f.uid}`}>
                Row {f.row} {f.uid ? `(${f.uid})` : ''}: {f.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="!p-0">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 border-b border-slate-100 p-3">
          <Input placeholder="Search UID, name, mobile, dept…" value={search} onChange={(e) => setSearch(e.target.value)} className="!py-2" />
          <Button type="submit" variant="secondary">Search</Button>
        </form>

        {loading ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState title="No candidates found" hint="Add candidates manually or import an Excel file." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">UID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Dept / College</th>
                  <th className="px-4 py-3">Exam</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-brand-700">{c.uid}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{c.name}</td>
                    <td className="px-4 py-3">{c.mobile}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {c.department || '—'}
                      <br />
                      {c.college || '—'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(c)}</td>
                    <td className="px-4 py-3 text-xs">
                      {c.finalScore !== null ? <b>{c.finalScore}</b> : '—'}{' '}
                      {c.malpracticeStatus !== 'NORMAL' && c.examStatus !== 'NOT_STARTED' && (
                        <Badge kind={c.malpracticeStatus === 'CONFIRMED' || c.malpracticeStatus === 'TERMINATED' ? 'red' : 'amber'}>
                          {c.malpracticeStatus}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 text-xs font-semibold">
                        <button className="rounded px-2 py-1 text-brand-600 hover:bg-brand-50" onClick={() => openEdit(c)}>Edit</button>
                        <button className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={() => handleReset(c)}>Reset</button>
                        <button className="rounded px-2 py-1 text-rose-500 hover:bg-rose-50" onClick={() => handleDelete(c)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
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
        <Modal title="RESET CANDIDATE LIST?" onClose={() => !resetting && setResetModalOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              This will remove all candidates from the current Candidate list.
              <br />
              <b>This action cannot be undone.</b>
            </div>
            <p className="text-sm text-slate-600">
              Type <b>RESET CANDIDATES</b> to confirm.
            </p>
            <Input
              value={resetConfirm}
              placeholder="RESET CANDIDATES"
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
                disabled={resetConfirm !== 'RESET CANDIDATES'}
                onClick={handleResetList}
              >
                Reset Candidate List
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {modal !== 'closed' && (
        <Modal title={editing ? `Edit ${editing.name}` : 'Add candidate'} onClose={() => setModal('closed')}>
          <div className="space-y-3">
            <Input
              label="UID *"
              value={form.uid}
              disabled={Boolean(editing)}
              placeholder="SWAP2K26XXXX"
              onChange={(e) => setForm({ ...form, uid: e.target.value.toUpperCase() })}
            />
            <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input
              label="Mobile *"
              type="tel"
              maxLength={10}
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
            />
            <Input label="College" value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} />
            <Input label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setModal('closed')} disabled={saving}>
                Cancel
              </Button>
              <Button loading={saving} onClick={handleSave} disabled={!form.uid || !form.name || form.mobile.length !== 10}>
                {editing ? 'Save changes' : 'Create candidate'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
