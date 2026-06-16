import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { LoginPage } from './LoginPage';

/** Renders the app only when signed in; otherwise the login screen. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-secondary text-[13px] text-text-secondary">
        Loading…
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return <>{children}</>;
}
