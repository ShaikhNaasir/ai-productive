import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

// Gate for admin-only pages. Assumes it renders inside ProtectedRoute (an
// authenticated Layout), but re-checks so a direct hit can't slip through.
export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return children;
}
