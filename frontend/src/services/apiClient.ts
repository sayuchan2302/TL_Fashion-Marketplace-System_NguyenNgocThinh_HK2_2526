import { AuthRefreshError, authService } from './authService';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const buildUrl = (path: string) => {
  if (!API_BASE || /^https?:\/\//.test(path)) {
    return path;
  }
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
};

const parseErrorMessage = async (response: Response) => {
  const fallbackByStatus: Record<number, string> = {
    429: 'Ban dang tim kiem bang anh qua nhanh. Vui long thu lai sau.',
    400: 'Dữ liệu gửi lên chưa hợp lệ.',
    401: 'Hết phiên đăng nhập. Vui lòng đăng nhập lại.',
    403: 'Bạn không có quyền thực hiện thao tác này.',
    404: 'Không tìm thấy dữ liệu yêu cầu.',
    409: 'Dữ liệu đang xung đột. Vui lòng tải lại và thử lại.',
    422: 'Thông tin nhập vào chưa hợp lệ.',
    500: 'Hệ thống đang bận. Vui lòng thử lại sau.',
    502: 'Máy chủ tạm thời không khả dụng. Vui lòng thử lại sau.',
    503: 'Dịch vụ đang bảo trì hoặc quá tải. Vui lòng thử lại sau.',
    504: 'Máy chủ phản hồi quá chậm. Vui lòng thử lại sau.',
  };
  const fallbackMessage = fallbackByStatus[response.status] || response.statusText || 'Request failed';

  try {
    const payload = await response.clone().json();
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return { message: payload.message, payload };
    }
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return { message: payload.error, payload };
    }
    return { message: fallbackMessage, payload };
  } catch {
    const text = await response.text();
    return { message: text || fallbackMessage, payload: text };
  }
};

const redirectToLogin = (reason = 'session-expired') => {
  authService.logout(reason);
  authService.adminLogout(reason);
  if (typeof window !== 'undefined') {
    const current = window.location.pathname + window.location.search;
    const target = `/login?reason=${encodeURIComponent(reason)}&redirect=${encodeURIComponent(current)}`;
    window.location.href = target;
  }
};

let refreshPromise: Promise<unknown> | null = null;

const ensureAuthToken = async (): Promise<string> => {
  const stored = authService.getSession() || authService.getAdminSession();
  const token = stored?.token;

  if (!token || !authService.isBackendJwtToken(token)) {
    redirectToLogin('session-expired');
    throw new ApiError('Current session is not using a backend JWT.', 401);
  }

  if (!authService.isJwtExpired(token)) {
    return token;
  }

  if (!authService.getRefreshToken()) {
    redirectToLogin('session-expired');
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  try {
    if (!refreshPromise) {
      refreshPromise = authService.refresh().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise as { token: string };
    return refreshed.token;
  } catch (error) {
    if (error instanceof AuthRefreshError && error.status >= 400 && error.status < 500) {
      redirectToLogin('session-expired');
      throw new ApiError('Hết phiên đăng nhập. Vui lòng đăng nhập lại.', 401);
    }
    throw error;
  }
};

export const hasBackendJwt = () => {
  const stored = authService.getSession() || authService.getAdminSession();
  const token = stored?.token;
  return Boolean(token && authService.isBackendJwtToken(token) && !authService.isJwtExpired(token));
};

export const apiRequest = async <T>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean } = {},
  attemptedRefresh = false,
): Promise<T> => {
  const headers = new Headers(init.headers || {});
  const isFormDataBody = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const needsJson = init.body !== undefined && !isFormDataBody && !headers.has('Content-Type');

  if (needsJson) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.auth) {
    const token = await ensureAuthToken();
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
  });

  if (!response.ok) {
    if (options.auth && response.status === 401 && !attemptedRefresh) {
      try {
        if (!refreshPromise) {
          refreshPromise = authService.refresh().finally(() => {
            refreshPromise = null;
          });
        }
        await refreshPromise;
        return apiRequest<T>(path, init, options, true);
      } catch (error) {
        redirectToLogin('session-expired');
        if (error instanceof AuthRefreshError && error.status >= 400 && error.status < 500) {
          throw new ApiError('Hết phiên đăng nhập. Vui lòng đăng nhập lại.', 401);
        }
        const { message, payload } = await parseErrorMessage(response);
        throw new ApiError(message, response.status, payload);
      }
    }

    if (options.auth && response.status === 401) {
      redirectToLogin('session-expired');
    }

    const { message, payload } = await parseErrorMessage(response);
    throw new ApiError(message, response.status, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return response.text() as unknown as T;
};
