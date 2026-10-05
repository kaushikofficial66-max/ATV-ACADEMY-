'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from './api';
import { getToken, setToken, clearToken, getAdminToken, setAdminToken } from '@/lib/auth/token';
import { post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { disconnectSocket } from '@/lib/socket';
import { ROLE_HOME } from '@/config/constants';

const AuthContext = createContext(null);

/**
 * Holds the logged-in user. On load it restores the session from the stored
 * token (GET /auth/me). Exposes login / register / logout / refresh.
 */
export function AuthProvider({ children }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | guest

  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setStatus('guest');
      return null;
    }
    try {
      const res = await authApi.me();
      setUser(res.data.user);
      setStatus('authenticated');
      return res.data.user;
    } catch {
      clearToken();
      setUser(null);
      setStatus('guest');
      return null;
    }
  }, []);

  useEffect(() => {
    // The token lives in localStorage, so the session is restored after mount.
    Promise.resolve().then(loadUser);
    const onLogout = () => {
      queryClient.clear();
      disconnectSocket();
      // An expired "view as" token falls back to the admin's own session.
      const adminToken = getAdminToken();
      if (adminToken) {
        setAdminToken(null);
        setToken(adminToken);
        loadUser().then(() => router.replace('/admin'));
        return;
      }
      setUser(null);
      setStatus('guest');
    };
    const onStorage = (e) => e.key === 'atv_token' && loadUser();
    window.addEventListener('auth:logout', onLogout);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth:logout', onLogout);
      window.removeEventListener('storage', onStorage);
    };
  }, [loadUser, queryClient, router]);

  const startSession = useCallback((data) => {
    if (data?.token) setToken(data.token);
    setUser(data?.user || null);
    setStatus(data?.token ? 'authenticated' : 'guest');
    return data?.user;
  }, []);

  const login = useCallback(async (email, password) => startSession((await authApi.login({ email, password })).data), [startSession]);

  const register = useCallback(async (body) => {
    const res = await authApi.register(body);
    startSession(res.data);
    return res;
  }, [startSession]);

  /** Admin: preview the app as a student / tutor (read-only, no password). */
  const viewAs = useCallback(
    async (userId) => {
      const res = await post(EP.admin.impersonate(userId));
      if (!getAdminToken()) setAdminToken(getToken());
      setToken(res.data.token);
      queryClient.clear();
      disconnectSocket();
      setUser(res.data.user);
      setStatus('authenticated');
      router.replace(ROLE_HOME[res.data.user.role_name] || '/');
    },
    [queryClient, router]
  );

  /** Ends a "view as" preview and restores the admin session. */
  const exitViewAs = useCallback(async () => {
    const adminToken = getAdminToken();
    setAdminToken(null);
    queryClient.clear();
    disconnectSocket();
    if (!adminToken) {
      clearToken();
      setUser(null);
      setStatus('guest');
      router.replace('/login');
      return;
    }
    setToken(adminToken);
    await loadUser();
    router.replace('/admin');
  }, [queryClient, router, loadUser]);

  const logout = useCallback(async () => {
    // Logging out of a preview just returns to the admin account.
    if (getAdminToken()) return exitViewAs();
    try {
      await authApi.logout();
    } catch {
      /* already logged out on the server */
    }
    clearToken();
    setUser(null);
    setStatus('guest');
    queryClient.clear();
    router.replace('/login');
  }, [queryClient, router, exitViewAs]);

  const value = useMemo(
    () => ({
      user,
      role: user?.role_name || user?.role?.name || null,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      register,
      logout,
      viewAs,
      exitViewAs,
      impersonator: user?.impersonated_by || null,
      refresh: loadUser,
      homePath: user ? ROLE_HOME[user.role_name || user.role?.name] || '/' : '/login'
    }),
    [user, status, login, register, logout, viewAs, exitViewAs, loadUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
