import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminLogin, getMe } from '../services/examApi';
import { toApiFailure } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Alert, Button, Card, Input } from '../components/ui';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
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
      await adminLogin(email.trim(), password);
      setUser(await getMe());
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(toApiFailure(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 text-center text-white">
          <h1 className="text-2xl font-black">SWAP 2K26 Admin</h1>
          <p className="mt-1 text-sm text-slate-400">Examination management console</p>
        </div>
        <Card className="shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            {error && <Alert>{error}</Alert>}
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCorrect="off"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              Sign In
            </Button>
          </form>
        </Card>
        <p className="mt-5 text-center text-xs text-slate-400">
          <Link to="/login" className="underline hover:text-white">
            Candidate sign in
          </Link>
        </p>
      </div>
    </div>
  );
}