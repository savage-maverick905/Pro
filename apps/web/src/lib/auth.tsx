import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router-dom';
import { api } from './api';
import { Spinner } from '../components/ui';

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<{ email: string }>('/api/auth/me') });

export function ProtectedRoute() {
  const me = useMe();
  if (me.isPending) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (me.isError) return <Navigate to="/login" replace />;
  return <Outlet />;
}
