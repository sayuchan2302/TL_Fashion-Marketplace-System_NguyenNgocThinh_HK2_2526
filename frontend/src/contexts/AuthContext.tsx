/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AUTH_SESSION_CHANGED_EVENT, authService } from '../services/authService';
import type { AuthResponse, User } from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithFacebook: (accessToken: string) => Promise<void>;
  refreshSession: (next: AuthResponse) => void;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: (reason?: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<AuthResponse | null>(() => authService.getSession() || authService.getAdminSession());

  useEffect(() => {
    const syncSession = () => {
      setSession(authService.getSession() || authService.getAdminSession());
    };

    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      const stored = authService.getSession() || authService.getAdminSession();
      if (!stored) {
        setSession(null);
        return;
      }

      const hasValidBackendJwt = authService.isBackendJwtToken(stored.token) && !authService.isJwtExpired(stored.token);

      if (!hasValidBackendJwt) {
        if (authService.getRefreshToken()) {
          try {
            const refreshed = await authService.refresh();
            setSession(refreshed);
            return;
          } catch {
            authService.logout('session-expired');
            authService.adminLogout('session-expired');
            setSession(null);
            return;
          }
        }
        authService.logout('session-expired');
        authService.adminLogout('session-expired');
        setSession(null);
        return;
      }

      setSession(stored);
    };

    void init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authService.login(email, password);
    setSession(res);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const res = await authService.loginWithGoogle(idToken);
    setSession(res);
  }, []);

  const loginWithFacebook = useCallback(async (accessToken: string) => {
    const res = await authService.loginWithFacebook(accessToken);
    setSession(res);
  }, []);

  const refreshSession = useCallback((next: AuthResponse) => {
    setSession(next);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await authService.register(name, email, password);
    setSession(res);
  }, []);

  const logout = useCallback((reason?: string) => {
    authService.logout(reason);
    authService.adminLogout(reason);
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user || null,
      token: session?.token || null,
      isAuthenticated: Boolean(session?.token),
      login,
      loginWithGoogle,
      loginWithFacebook,
      refreshSession,
      register,
      logout,
    }),
    [session, login, loginWithGoogle, loginWithFacebook, refreshSession, register, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
