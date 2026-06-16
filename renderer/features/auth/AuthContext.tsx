import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser, LoginInput } from '@shared/schemas/auth';
import { fetchMe, loginRequest, logoutRequest } from '../../lib/auth';

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchMe().then((u) => {
      if (active) {
        setUser(u);
        setLoading(false);
      }
    });
    // A mid-session 401 (expiry) is broadcast by the bridge — drop to login.
    const onUnauth = () => setUser(null);
    window.addEventListener('hyprride:unauthenticated', onUnauth);
    return () => {
      active = false;
      window.removeEventListener('hyprride:unauthenticated', onUnauth);
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    setUser(await loginRequest(input));
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
