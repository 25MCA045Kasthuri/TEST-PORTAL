import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { PageLoader } from './components/ui';
import CandidateLogin from './pages/CandidateLogin';
import AdminLogin from './pages/AdminLogin';
import Instructions from './pages/candidate/Instructions';
import Test from './pages/candidate/Test';
import Submitted from './pages/candidate/Submitted';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Candidates from './pages/admin/Candidates';
import Questions from './pages/admin/Questions';
import Results from './pages/admin/Results';
import Malpractice from './pages/admin/Malpractice';
import Settings from './pages/admin/Settings';
import Live from './pages/admin/Live';
import NotFound from './pages/NotFound';

function RequireRole({ role }: { role: 'admin' | 'candidate' }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={role === 'admin' ? '/admin/login' : '/login'} state={{ from: location }} replace />;
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/test'} replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<CandidateLogin />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      <Route element={<RequireRole role="candidate" />}>
        <Route path="/instructions" element={<Instructions />} />
        <Route path="/test" element={<Test />} />
        <Route path="/submitted" element={<Submitted />} />
      </Route>

      <Route element={<RequireRole role="admin" />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="candidates" element={<Candidates />} />
          <Route path="questions" element={<Questions />} />
          <Route path="results" element={<Results />} />
          <Route path="malpractice" element={<Malpractice />} />
          <Route path="live" element={<Live />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}