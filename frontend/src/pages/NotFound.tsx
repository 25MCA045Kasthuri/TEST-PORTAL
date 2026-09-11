import { Navigate } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-black text-brand-600">404</p>
      <p className="text-lg font-semibold text-slate-700">Page not found</p>
      <Navigate to="/" replace />
    </div>
  );
}