/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { ApiError, apiRequest } from '../services/apiClient';
import { authService } from '../services/authService';

export interface WishlistItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  storeId?: string;
  storeName?: string;
  isOfficialStore?: boolean;
}

interface WishlistContextType {
  items: WishlistItem[];
  addToWishlist: (item: WishlistItem) => void;
  removeFromWishlist: (id: string) => void;
  isInWishlist: (id: string) => boolean;
  totalItems: number;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

const buildLoginRedirectTarget = () => {
  if (typeof window === 'undefined') return '/login';
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/login?reason=${encodeURIComponent('auth-required')}&redirect=${encodeURIComponent(current)}`;
};

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const { addToast } = useToast();
  const { token } = useAuth();
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const hasBackendSession = Boolean(token && authService.isBackendJwtToken(token));

  const enqueueMutation = useCallback((task: () => Promise<void>) => {
    mutationQueueRef.current = mutationQueueRef.current
      .then(task)
      .catch(() => { });
  }, []);

  const ensureAuthenticated = useCallback(() => {
    if (hasBackendSession) return true;

    addToast('Vui lòng đăng nhập để dùng danh sách yêu thích.', 'info');
    if (typeof window !== 'undefined') {
      window.location.href = buildLoginRedirectTarget();
    }
    return false;
  }, [addToast, hasBackendSession]);

  const refreshWishlistFromBackend = useCallback(async () => {
    if (!hasBackendSession) {
      setItems([]);
      return;
    }

    try {
      const data = await apiRequest<WishlistItem[]>('/api/wishlist', {}, { auth: true });
      setItems(data || []);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setItems([]);
        return;
      }
      console.error('Failed to sync wishlist with DB', error);
    }
  }, [hasBackendSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshWishlistFromBackend();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshWishlistFromBackend]);

  const addToWishlist = useCallback((item: WishlistItem) => {
    if (!ensureAuthenticated()) {
      return;
    }

    const exists = items.some(i => i.id === item.id);
    if (exists) return;

    enqueueMutation(async () => {
      try {
        await apiRequest<void>(`/api/wishlist/${encodeURIComponent(item.id)}`, { method: 'POST' }, { auth: true });
        setItems(prev => [...prev.filter(i => i.id !== item.id), item]);
        addToast('Đã thêm vào danh sách yêu thích', 'add');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Không thể thêm vào danh sách yêu thích';
        addToast(msg, 'error');
      }
    });
  }, [addToast, enqueueMutation, ensureAuthenticated, items]);

  const removeFromWishlist = useCallback((id: string) => {
    if (!hasBackendSession) return;

    enqueueMutation(async () => {
      try {
        await apiRequest<void>(`/api/wishlist/${encodeURIComponent(id)}`, { method: 'DELETE' }, { auth: true });
        setItems(prev => prev.filter(item => item.id !== id));
        addToast('Đã xoá khỏi danh sách yêu thích', 'remove');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Không thể xoá khỏi danh sách yêu thích';
        addToast(msg, 'error');
      }
    });
  }, [addToast, enqueueMutation, hasBackendSession]);

  const isInWishlist = useCallback((id: string) => items.some(i => i.id === id), [items]);

  const totalItems = items.length;

  const value = useMemo(() => ({
    items,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    totalItems,
  }), [items, addToWishlist, removeFromWishlist, isInWishlist, totalItems]);

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
};

