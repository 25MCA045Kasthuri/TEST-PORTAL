import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { candidateLogin, getMe } from '../services/examApi';
import { toApiFailure } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Alert, Button, Card, Input } from '../components/ui';

export default function CandidateLogin() {
  const [uid, setUid] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await candidateLogin(uid.trim(), password);
      setUser(await getMe());
      navigate('/instructions', { replace: true });
    } catch (err) {
      setError(toApiFailure(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-700 via-brand-600 to-brand-800 p-4 no-select">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 text-center text-white">
          <h1 className="text-3xl font-black tracking-tight">SWAP 2K26</h1>
          <p className="mt-1 text-sm text-brand-100">Mobile Examination Portal — Candidate Login</p>
        </div>
        <Card className="shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            {error && <Alert>{error}</Alert>}
            <Input
              label="Candidate UID"
              placeholder="SWAP2K26XXXX"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              Sign In
            </Button>
            <p className="text-center text-xs text-slate-400">
              Default password: <b>Jmc</b> + last 4 digits of your UID (e.g. SWAP2K260001 → Jmc0001)
            </p>
          </form>
        </Card>
        <p className="mt-5 text-center text-xs text-brand-200">
          <Link to="/admin/login" className="underline hover:text-white">
            Administrator sign in
          </Link>
        </p>
      </div>
    </div>
  );
}