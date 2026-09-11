import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../../services/adminApi';
import { toApiFailure } from '../../services/api';
import { Alert, Button, Card, Input, PageLoader } from '../../components/ui';
import type { AppSettings } from '../../types';

export default function Settings() {
  const [form, setForm] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getSettings()
      .then(setForm)
      .catch((e) => setError(toApiFailure(e).message));
  }, []);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateSettings({
        examTitle: form.examTitle,
        durationMinutes: Number(form.durationMinutes),
        totalQuestions: Number(form.totalQuestions),
        marksPerCorrect: Number(form.marksPerCorrect),
        maxViolations: Number(form.maxViolations),
        autoTerminateEnabled: form.autoTerminateEnabled,
        fullscreenRequired: form.fullscreenRequired,
        examEnabled: form.examEnabled,
      });
      setForm(updated);
      setNotice('Settings saved. New values apply to future exam sessions.');
    } catch (e) {
      setError(toApiFailure(e).message);
    } finally {
      setSaving(false);
    }
  }

  if (!form && !error) return <PageLoader />;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-black text-slate-800">Exam settings</h1>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      {form && (
        <Card className="space-y-4">
          <Input label="Exam title" value={form.examTitle} onChange={(e) => setForm({ ...form, examTitle: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duration (minutes)"
              type="number"
              min={1}
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
            />
            <Input
              label="Total questions"
              type="number"
              min={1}
              value={form.totalQuestions}
              onChange={(e) => setForm({ ...form, totalQuestions: Number(e.target.value) })}
            />
            <Input
              label="Marks per correct answer"
              type="number"
              min={0}
              value={form.marksPerCorrect}
              onChange={(e) => setForm({ ...form, marksPerCorrect: Number(e.target.value) })}
            />
            <Input
              label="Max violations before action"
              type="number"
              min={1}
              value={form.maxViolations}
              onChange={(e) => setForm({ ...form, maxViolations: Number(e.target.value) })}
            />
          </div>

          {[
            { key: 'examEnabled' as const, label: 'Exam enabled', hint: 'Candidates can start/resume the exam while checked.' },
            { key: 'autoTerminateEnabled' as const, label: 'Auto-terminate on max violations', hint: 'Terminate attempts automatically when the violation limit is reached.' },
            { key: 'fullscreenRequired' as const, label: 'Fullscreen required', hint: 'Exiting fullscreen counts as a MAJOR violation.' },
          ].map((t) => (
            <label key={t.key} className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 p-3">
              <span>
                <span className="block text-sm font-semibold text-slate-700">{t.label}</span>
                <span className="block text-xs text-slate-400">{t.hint}</span>
              </span>
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                checked={form[t.key]}
                onChange={(e) => setForm({ ...form, [t.key]: e.target.checked })}
              />
            </label>
          ))}

          <div className="flex justify-end">
            <Button loading={saving} onClick={handleSave}>Save settings</Button>
          </div>
        </Card>
      )}
    </div>
  );
}