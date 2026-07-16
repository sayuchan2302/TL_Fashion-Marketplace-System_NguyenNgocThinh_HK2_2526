import type { AuthResponse, User } from '../types';

const AUTH_KEY = 'coolmate_auth_v1';
const ADMIN_AUTH_KEY = 'coolmate_admin_auth_v1';
const SESSION_REASON_KEY = 'coolmate_auth_reason_v1';
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const AUTH_SESSION_CHANGED_EVENT = 'coolmate-auth-session-changed';

export class AuthRefreshError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthRefreshError';
    this.status = status;
  }
}

if (!API_BASE) {
  console.warn('[auth] VITE_API_URL is empty. Authentication requests will fail until backend URL is configured.');
}

interface BackendAuthResponse {
  token: string;
  refreshToken?: string;
  email?: string;
  name?: string;
  avatar?: string;
  role?: string;
  storeId?: string;
  approvedVendor?: boolean;
}

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U';

const buildApiUrl = (path: string) => {
  if (!API_BASE) {
    return path;
  }
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
};

const parseJsonSafely = async <T>(response: Response): Promise<T | null> => {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
};

const parseBackendError = async (response: Response) => {
  const payload = await parseJsonSafely<Record<string, unknown>>(response);
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error;
  }
  return response.statusText || 'Authentication failed';
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const isBackendJwtToken = (token?: string | null) => Boolean(token && token.split('.').length === 3);

const getExpiry = (token?: string | null): number | null => {
  const claims = token ? decodeJwtPayload(token) : null;
  const exp = claims?.exp;
  return typeof exp === 'number' ? exp : null;
};

const isJwtExpired = (token?: string | null, skewSeconds = 60) => {
  const exp = getExpiry(token);
  if (!exp) return false;
  const nowSeconds = Date.now() / 1000;
  return exp - skewSeconds <= nowSeconds;
};

const mapBackendAuthResponse = (payload: BackendAuthResponse): AuthResponse => {
  const claims = decodeJwtPayload(payload.token);
  const role = payload.role === 'VENDOR' || payload.role === 'SUPER_ADMIN' || payload.role === 'CUSTOMER'
    ? payload.role
    : 'CUSTOMER';
  const name = payload.name?.trim() || payload.email?.split('@')[0] || 'User';
  const email = payload.email?.trim() || String(claims?.sub || '');
  const avatar = payload.avatar?.trim() || getInitials(name);
  const userId = typeof claims?.userId === 'string' ? claims.userId : `u_${Date.now()}`;

  return {
    token: payload.token,
    refreshToken: payload.refreshToken,
    user: {
      id: userId,
      name,
      email,
      avatar,
      role,
      storeId: payload.storeId,
      isApprovedVendor: payload.approvedVendor ?? (role === 'VENDOR'),
    },
  };
};

const loginWithBackend = async (email: string, password: string): Promise<AuthResponse | null> => {
  if (!API_BASE) {
    throw new Error('VITE_API_URL is empty. Please configure backend API URL.');
  }

  try {
    const response = await fetch(buildApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const message = await parseBackendError(response);
      throw new Error(message);
    }

    const payload = await parseJsonSafely<BackendAuthResponse>(response);
    return payload?.token ? mapBackendAuthResponse(payload) : null;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Dang nhap that bai');
  }
};

const loginWithGoogleBackend = async (idToken: string): Promise<AuthResponse | null> => {
  if (!API_BASE) {
    throw new Error('VITE_API_URL is empty. Please configure backend API URL.');
  }

  try {
    const response = await fetch(buildApiUrl('/api/auth/google'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      const message = await parseBackendError(response);
      throw new Error(message);
    }

    const payload = await parseJsonSafely<BackendAuthResponse>(response);
    return payload?.token ? mapBackendAuthResponse(payload) : null;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Dang nhap Google that bai');
  }
};

const loginWithFacebookBackend = async (accessToken: string): Promise<AuthResponse | null> => {
  if (!API_BASE) {
    throw new Error('VITE_API_URL is empty. Please configure backend API URL.');
  }

  try {
    const response = await fetch(buildApiUrl('/api/auth/facebook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    });

    if (!response.ok) {
      const message = await parseBackendError(response);
      throw new Error(message);
    }

    const payload = await parseJsonSafely<BackendAuthResponse>(response);
    return payload?.token ? mapBackendAuthResponse(payload) : null;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Đăng nhập Facebook thất bại');
  }
};

const registerWithBackend = async (name: string, email: string, password: string): Promise<AuthResponse | null> => {
  if (!API_BASE) {
    throw new Error('VITE_API_URL is empty. Please configure backend API URL.');
  }

  try {
    const response = await fetch(buildApiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    if (response.ok) {
      const payload = await parseJsonSafely<BackendAuthResponse>(response);
      return payload?.token ? mapBackendAuthResponse(payload) : null;
    }

    if (response.status >= 400 && response.status < 500) {
      throw new Error(await parseBackendError(response));
    }

    return null;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    return null;
  }
};

const persist = (data: AuthResponse | null) => {
  if (data) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
    localStorage.removeItem(SESSION_REASON_KEY);
  } else {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(SESSION_REASON_KEY);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
  }
};

const persistAdmin = (data: AuthResponse | null) => {
  // Legacy admin-only storage is kept only for cleanup/migration.
  // Backend-authenticated sessions now persist through the main auth key.
  sessionStorage.removeItem(ADMIN_AUTH_KEY);
  if (data) {
    persist(data);
  }
};

const readLegacyAdminSession = (): AuthResponse | null => {
  try {
    const raw = sessionStorage.getItem(ADMIN_AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getPersistedSession = (): AuthResponse | null => {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    localStorage.removeItem(AUTH_KEY);
  }

  const legacyAdminSession = readLegacyAdminSession();
  if (legacyAdminSession) {
    persist(legacyAdminSession);
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    return legacyAdminSession;
  }

  return null;
};

export const authService = {
  isBackendJwtToken,
  isJwtExpired,

  getSession(): AuthResponse | null {
    return getPersistedSession();
  },

  getRefreshToken(): string | null {
    return this.getSession()?.refreshToken || null;
  },

  clearSession(reason?: string) {
    if (reason) {
      localStorage.setItem(SESSION_REASON_KEY, reason);
    }
    persist(null);
    persistAdmin(null);
  },

  consumeClearReason(): string | null {
    const reason = localStorage.getItem(SESSION_REASON_KEY);
    if (reason) {
      localStorage.removeItem(SESSION_REASON_KEY);
      return reason;
    }
    return null;
  },

  async refresh(): Promise<AuthResponse> {
    if (!API_BASE) {
      throw new Error('Cannot refresh without backend API.');
    }
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.logout('session-expired');
      throw new AuthRefreshError('Missing refresh token.', 401);
    }

    const response = await fetch(buildApiUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const message = await parseBackendError(response);
      if (response.status >= 400 && response.status < 500) {
        this.logout('session-expired');
        throw new AuthRefreshError(message, response.status);
      }
      throw new AuthRefreshError(message, response.status);
    }

    const payload = await parseJsonSafely<BackendAuthResponse>(response);
    if (!payload?.token) {
      throw new Error('Refresh response missing token.');
    }

    const session = mapBackendAuthResponse(payload);
    persist(session);
    if (session.user.role === 'VENDOR' || session.user.role === 'SUPER_ADMIN') {
      persistAdmin(session);
    }
    return session;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    await new Promise(resolve => setTimeout(resolve, 300));

    if (!email || !password) {
      throw new Error('Vui long nhap email va mat khau');
    }

    const backendSession = await loginWithBackend(email, password);
    if (!backendSession) {
      throw new Error('Dang nhap that bai. Vui long kiem tra lai tai khoan/mat khau.');
    }
    persist(backendSession);
    if (backendSession.user.role === 'VENDOR' || backendSession.user.role === 'SUPER_ADMIN') {
      persistAdmin(backendSession);
    }
    return backendSession;
  },

  async loginWithGoogle(idToken: string): Promise<AuthResponse> {
    if (!idToken) {
      throw new Error('Thieu ma xac thuc Google');
    }

    const backendSession = await loginWithGoogleBackend(idToken);
    if (!backendSession) {
      throw new Error('Dang nhap Google that bai. Vui long thu lai.');
    }
    persist(backendSession);
    if (backendSession.user.role === 'VENDOR' || backendSession.user.role === 'SUPER_ADMIN') {
      persistAdmin(backendSession);
    }
    return backendSession;
  },

  async loginWithFacebook(accessToken: string): Promise<AuthResponse> {
    if (!accessToken) {
      throw new Error('Thiếu mã xác thực Facebook');
    }

    const backendSession = await loginWithFacebookBackend(accessToken);
    if (!backendSession) {
      throw new Error('Đăng nhập Facebook thất bại. Vui lòng thử lại.');
    }
    persist(backendSession);
    if (backendSession.user.role === 'VENDOR' || backendSession.user.role === 'SUPER_ADMIN') {
      persistAdmin(backendSession);
    }
    return backendSession;
  },

  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    await new Promise(resolve => setTimeout(resolve, 300));

    if (!name || !email || !password) {
      throw new Error('Vui long nhap day du thong tin');
    }

    if (password.length < 6) {
      throw new Error('Mat khau phai co it nhat 6 ky tu');
    }

    const backendSession = await registerWithBackend(name, email, password);
    if (!backendSession) {
      throw new Error('Dang ky that bai. Vui long thu lai.');
    }
    persist(backendSession);
    return backendSession;
  },

  async forgot(email: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 300));
    if (!email) throw new Error('Vui long nhap email');
    if (!API_BASE) {
      throw new Error('VITE_API_URL is empty. Please configure backend API URL.');
    }

    const response = await fetch(buildApiUrl('/api/auth/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error(await parseBackendError(response));
    }
  },

  async reset(token: string, newPassword: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 300));
    if (!token) throw new Error('Link dat lai mat khau khong hop le');
    if (!newPassword) throw new Error('Vui long nhap mat khau moi');
    if (!API_BASE) {
      throw new Error('VITE_API_URL is empty. Please configure backend API URL.');
    }

    const response = await fetch(buildApiUrl('/api/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });

    if (!response.ok) {
      throw new Error(await parseBackendError(response));
    }
  },

  logout(reason?: string) {
    this.clearSession(reason);
  },

  updateSession(user: User) {
    const session = this.getSession();
    if (!session) return null;
    const next = { ...session, user } as AuthResponse;
    persist(next);
    if (user.role === 'VENDOR' || user.role === 'SUPER_ADMIN') {
      persistAdmin(next);
    }

    return next;
  },

  getAdminSession(): AuthResponse | null {
    return getPersistedSession();
  },

  async adminLogin(email: string, password: string): Promise<AuthResponse> {
    await new Promise(resolve => setTimeout(resolve, 300));

    if (!email || !password) {
      throw new Error('Vui long nhap email va mat khau');
    }

    if (!API_BASE) {
      throw new Error('Admin/seller panel yeu cau backend JWT. Vui long cau hinh VITE_API_URL.');
    }

    const backendSession = await loginWithBackend(email, password);
    if (!backendSession) {
      throw new Error('Admin/seller panel now requires backend JWT login.');
    }

    if (backendSession.user.role !== 'SUPER_ADMIN' && backendSession.user.role !== 'VENDOR') {
      throw new Error('This account cannot access the admin/seller panel.');
    }

    persist(backendSession);
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    return backendSession;
  },

  adminLogout(reason?: string) {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    const session = this.getSession();
    if (session?.user.role === 'SUPER_ADMIN' || session?.user.role === 'VENDOR') {
      this.clearSession(reason);
    }
  },

  isAdminAuthenticated(): boolean {
    const session = this.getAdminSession();
    return Boolean(session?.token);
  },
};
