import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../utils/cn';

const links = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/candidates', label: 'Candidates' },
  { to: '/admin/questions', label: 'Questions' },
  { to: '/admin/results', label: 'Results' },
  { to: '/admin/malpractice', label: 'Malpractice' },
  { to: '/admin/live', label: 'Live Monitor' },
  { to: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white">S</div>
            <div>
              <p className="text-sm font-black leading-tight text-slate-800">SWAP 2K26 Admin</p>
              <p className="text-[11px] leading-tight text-slate-400">{user?.email ?? user?.name}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">
            Logout
          </button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-2">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}