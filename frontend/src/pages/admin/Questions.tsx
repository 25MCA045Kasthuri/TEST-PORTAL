import { useCallback, useEffect, useRef, useState } from 'react';
import { createQuestion, deleteQuestion, importQuestions, listQuestions, resetQuestionList, updateQuestion } from '../../services/adminApi';
import { toApiFailure } from '../../services/api';
import { Alert, Badge, Button, Card, EmptyState, Input, Modal, PageLoader, Select } from '../../components/ui';
import type { AdminQuestion, OptionKey, QuestionImportResult } from '../../types';

const KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];
const emptyForm = { questionNumber: '', question: '', A: '', B: '', C: '', D: '', correctAnswer: 'A' as OptionKey, marks: '1' };

export default function Questions() {
  const [rows, setRows] = useState<AdminQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [modal, setModal] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [importResult, setImportResult] = useState<QuestionImportResult | null>(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(
    async (p = page, s = search) => {
      setLoading(true);
      try {
        const data = await listQuestions({ page: p, limit: 20, search: s || undefined });
        setRows(data.questions);
        setTotal(data.total);
        setPages(data.totalPages);
        setActiveCount(data.activeCount);
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
    setForm({ ...emptyForm, questionNumber: String(total + 1) });
    setEditing(null);
    setModal('create');
  }

  function openEdit(q: AdminQuestion) {
    setEditing(q);
    setForm({
      questionNumber: String(q.questionNumber),
      question: q.question,
      A: q.options.A,
      B: q.options.B,
      C: q.options.C,
      D: q.options.D,
      correctAnswer: q.correctAnswer,
      marks: String(q.marks ?? 1),
    });
    setModal('edit');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const payload = {
      questionNumber: Number(form.questionNumber),
      question: form.question.trim(),
      options: { A: form.A.trim(), B: form.B.trim(), C: form.C.trim(), D: form.D.trim() },
      correctAnswer: form.correctAnswer,
      marks: Number(form.marks) || 1,
    };
    try {
      if (editing) {
        await updateQuestion(editing._id, payload);
        setNotice(`Question #${payload.questionNumber} updated.`);
      } else {
        await createQuestion(payload);
        setNotice(`Question #${payload.questionNumber} created.`);
      }
      setModal('closed');
      await load();
    } catch (e) {
      setError(toApiFailure(e).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(q: AdminQuestion) {
    if (!confirm(`Delete question #${q.questionNumber}?`)) return;
    try {
      await deleteQuestion(q._id);
      setNotice('Question deleted.');
      await load();
    } catch (e) {
      setError(toApiFailure(e).message);
    }
  }

  async function handleImportFile(file: File) {
    setError('');
    setNotice('');
    setImportResult(null);
    setPendingImport(file);
  }

  async function runImport() {
    if (!pendingImport) return;
    setImporting(true);
    setError('');
    try {
      const result = await importQuestions(pendingImport);
      setImportResult(result);
      setNotice(`${result.imported} question(s) imported (${result.rejected} rejected).`);
      await load(1, '');
    } catch (e) {
      setError(toApiFailure(e).message);
    } finally {
      setImporting(false);
      setPendingImport(null);
    }
  }

  async function handleResetList() {
    if (resetConfirm !== 'RESET QUESTIONS') return;
    setResetting(true);
    setError('');
    try {
      await resetQuestionList();
      setResetModalOpen(false);
      setResetConfirm('');
      setNotice('Question list reset successfully.');
      await load(1, '');
    } catch (e) {
      setError(toApiFailure(e).message);
    } finally {
      setResetting(false);
    }
  }

  const formValid =
    form.questionNumber !== '' && form.question.trim() !== '' && form.A.trim() && form.B.trim() && form.C.trim() && form.D.trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-slate-800">
          Questions <span className="text-sm font-medium text-slate-400">({total} total · {activeCount} active)</span>
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
          <Button onClick={openCreate}>+ Add question</Button>
          <Button variant="danger" onClick={() => setResetModalOpen(true)}>
            Reset Question List
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {importResult && (
        <Card>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Total rows: <b>{importResult.totalRows}</b></span>
            <span className="text-emerald-600">Imported: <b>{importResult.imported}</b></span>
            <span className="text-slate-500">Replaced existing set: <b>{importResult.replacedExisting ? 'Yes' : 'No'}</b></span>
            <span className="text-rose-600">Rejected: <b>{importResult.rejected}</b></span>
            {importResult.format && (
              <span className="text-brand-600">
                Format: <b>{importResult.format === 'legacy-ipl' ? 'Legacy IPL' : 'New'}</b>
              </span>
            )}
          </div>
          {importResult.rows.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
              {importResult.rows.map((r) => (
                <li key={`${r.row}-${r.questionNumber}`}>
                  Row {r.row} {r.questionNumber ? `(Q${r.questionNumber})` : ''}: {r.reason}
                </li>
              ))}
            </ul>
          )}
          {importResult.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-600">
              {importResult.warnings.map((w) => (
                <li key={`${w.row}-${w.questionNumber}`}>
                  Row {w.row} {w.questionNumber ? `(Q${w.questionNumber})` : ''}: {w.message}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="!p-0">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 border-b border-slate-100 p-3">
          <Input placeholder="Search question text…" value={search} onChange={(e) => setSearch(e.target.value)} className="!py-2" />
          <Button type="submit" variant="secondary">Search</Button>
        </form>

        {loading ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState title="No questions found" hint="Add questions manually or import an Excel file." />
        ) : (
          <div className="divide-y divide-slate-50">
            {rows.map((q) => (
              <div key={q._id} className="flex items-start justify-between gap-3 p-4 hover:bg-slate-50/60">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge kind="blue">Q{q.questionNumber}</Badge>
                    {!q.active && <Badge kind="slate">Inactive</Badge>}
                    <Badge kind="green">Ans: {q.correctAnswer}</Badge>
                    <span className="text-[11px] text-slate-400">{q.marks} mark(s)</span>
                  </div>
                  <p className="truncate text-sm font-semibold text-slate-700">{q.question}</p>
                  <p className="truncate text-xs text-slate-400">
                    A. {q.options.A} · B. {q.options.B} · C. {q.options.C} · D. {q.options.D}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 text-xs font-semibold">
                  <button className="rounded px-2 py-1 text-brand-600 hover:bg-brand-50" onClick={() => openEdit(q)}>Edit</button>
                  <button className="rounded px-2 py-1 text-rose-500 hover:bg-rose-50" onClick={() => handleDelete(q)}>Delete</button>
                </div>
              </div>
            ))}
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

      {modal !== 'closed' && (
        <Modal title={editing ? `Edit question #${editing.questionNumber}` : 'Add question'} onClose={() => setModal('closed')}>
          <div className="space-y-3">
            <div className="flex gap-3">
              <Input
                label="Q. No *"
                type="number"
                min={1}
                className="!w-24"
                value={form.questionNumber}
                onChange={(e) => setForm({ ...form, questionNumber: e.target.value })}
              />
              <Input label="Marks" type="number" min={0} className="!w-24" value={form.marks} onChange={(e) => setForm({ ...form, marks: e.target.value })} />
              <div className="flex-1">
                <Select label="Correct answer" value={form.correctAnswer} onChange={(e) => setForm({ ...form, correctAnswer: e.target.value as OptionKey })}>
                  {KEYS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </Select>
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Question *</span>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
              />
            </label>
            {KEYS.map((k) => (
              <Input
                key={k}
                label={`Option ${k} *`}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setModal('closed')} disabled={saving}>Cancel</Button>
              <Button loading={saving} onClick={handleSave} disabled={!formValid}>
                {editing ? 'Save changes' : 'Create question'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pendingImport && (
        <Modal title="Replace question set" onClose={() => !importing && setPendingImport(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Importing this Excel will replace the current question set
              <span className="text-slate-500"> ({total} existing questions)</span>. Continue?
            </p>
            <p className="text-xs text-slate-400">
              Existing candidates, exam attempts, results and malpractice logs will not be affected. The exam cannot be replaced while candidates are actively writing.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setPendingImport(null)} disabled={importing}>
                Cancel
              </Button>
              <Button loading={importing} onClick={runImport}>
                Replace Questions
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {resetModalOpen && (
        <Modal title="RESET QUESTION LIST?" onClose={() => !resetting && setResetModalOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              This will remove all questions from the current question bank.
              <br />
              <b>This action cannot be undone.</b>
            </div>
            <p className="text-sm text-slate-600">
              Type <b>RESET QUESTIONS</b> to confirm.
            </p>
            <Input
              value={resetConfirm}
              placeholder="RESET QUESTIONS"
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
                disabled={resetConfirm !== 'RESET QUESTIONS'}
                onClick={handleResetList}
              >
                Reset Question List
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
