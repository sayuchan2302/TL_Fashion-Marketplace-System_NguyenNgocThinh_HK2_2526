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

export type CartItem = {
  cartId: string; // backend cart item id
  id: number | string;
  backendProductId?: string;
  backendVariantId?: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  color: string;
  size: string;
  quantity: number;
  storeId?: string;
  storeName?: string;
  isOfficialStore?: boolean;
};

export type StoreGroup = {
  storeId: string;
  storeName: string;
  isOfficialStore: boolean;
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
};

interface CartContextValue {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, 'cartId' | 'quantity'> & { quantity?: number }) => void;
  removeFromCart: (cartId: string) => void;
  updateQuantity: (cartId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  groupedByStore: () => StoreGroup[];
}

interface BackendCartProduct {
  id?: string;
  name?: string;
  basePrice?: number | string;
  salePrice?: number | string;
  effectivePrice?: number | string;
  imageUrl?: string;
  storeId?: string;
  storeName?: string;
  officialStore?: boolean;
}

interface BackendCartVariant {
  id?: string;
  color?: string;
  size?: string;
}

interface BackendCartItem {
  id?: string;
  quantity?: number;
  unitPrice?: number | string;
  product?: BackendCartProduct;
  variant?: BackendCartVariant | null;
}

interface BackendCartResponse {
  items?: BackendCartItem[];
}

const CartContext = createContext<CartContextValue | null>(null);

const DEFAULT_SHIPPING_FEE = 30000;
const OWN_STORE_PURCHASE_MESSAGE = 'Khong the mua san pham tu gian hang cua chinh ban.';

const buildLoginRedirectTarget = () => {
  if (typeof window === 'undefined') return '/login';
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/login?reason=${encodeURIComponent('auth-required')}&redirect=${encodeURIComponent(current)}`;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
};

const toPositiveQuantity = (value: unknown): number => {
  const quantity = Math.floor(toNumber(value));
  return quantity > 0 ? quantity : 1;
};

const mapBackendCartToItems = (payload?: BackendCartResponse | null): CartItem[] => {
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  return rows.map((row, index) => {
    const productId = String(row.product?.id || '').trim();
    const cartItemId = String(row.id || `${productId || 'cart-item'}-${index + 1}`).trim();
    const variantId = String(row.variant?.id || '').trim();

    const basePrice = toNumber(row.product?.basePrice);
    const salePrice = toNumber(row.product?.salePrice);
    const effectivePriceFromProduct = toNumber(row.product?.effectivePrice);
    const unitPrice = toNumber(row.unitPrice);
    const effectivePrice = unitPrice > 0
      ? unitPrice
      : (effectivePriceFromProduct > 0 ? effectivePriceFromProduct : (salePrice > 0 ? salePrice : basePrice));
    const originalPrice = basePrice > effectivePrice ? basePrice : undefined;
    const storeName = String(row.product?.storeName || '').trim();

    return {
      cartId: cartItemId,
      id: productId || cartItemId,
      backendProductId: productId || undefined,
      backendVariantId: variantId || undefined,
      name: (row.product?.name || '').trim() || `Item ${index + 1}`,
      price: effectivePrice,
      originalPrice,
      image: String(row.product?.imageUrl || '').trim(),
      color: (row.variant?.color || '').trim() || 'Mac dinh',
      size: (row.variant?.size || '').trim() || 'F',
      quantity: toPositiveQuantity(row.quantity),
      storeId: String(row.product?.storeId || '').trim() || undefined,
      storeName: storeName || 'Cua hang',
      isOfficialStore: Boolean(row.product?.officialStore),
    };
  });
};

const normalizeStoreGroups = (items: CartItem[]): StoreGroup[] => {
  const groups = items.reduce((acc, item) => {
    const storeId = item.storeId || 'default-store';
    const storeName = item.storeName || 'Cua hang';

    if (!acc[storeId]) {
      acc[storeId] = {
        storeId,
        storeName,
        isOfficialStore: item.isOfficialStore || false,
        items: [],
        subtotal: 0,
        shippingFee: DEFAULT_SHIPPING_FEE,
      };
    }

    acc[storeId].items.push(item);
    acc[storeId].subtotal += item.price * item.quantity;
    return acc;
  }, {} as Record<string, StoreGroup>);

  Object.values(groups).forEach((group) => {
    group.shippingFee = DEFAULT_SHIPPING_FEE;
  });

  return Object.values(groups);
};

const toErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const { addToast } = useToast();
  const { token, user } = useAuth();
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const hasBackendSession = Boolean(token && authService.isBackendJwtToken(token));
  const userStoreId = String(user?.storeId || '').trim();

  const enqueueMutation = useCallback((task: () => Promise<void>) => {
    mutationQueueRef.current = mutationQueueRef.current
      .then(task)
      .catch(() => {
        // Ignore queue errors because each task already reports user-facing errors.
      });
  }, []);

  const ensureAuthenticated = useCallback(() => {
    if (hasBackendSession) return true;

    addToast('Vui long dang nhap de su dung gio hang.', 'info');
    if (typeof window !== 'undefined') {
      window.location.href = buildLoginRedirectTarget();
    }
    return false;
  }, [addToast, hasBackendSession]);

  const refreshCartFromBackend = useCallback(async () => {
    if (!hasBackendSession) {
      setItems([]);
      return;
    }

    try {
      const cart = await apiRequest<BackendCartResponse>('/api/cart', {}, { auth: true });
      setItems(mapBackendCartToItems(cart));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setItems([]);
        return;
      }
      addToast(toErrorMessage(error, 'Khong the tai gio hang.'), 'error');
    }
  }, [addToast, hasBackendSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshCartFromBackend();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshCartFromBackend]);

  const addToCart = useCallback((newItem: Omit<CartItem, 'cartId' | 'quantity'> & { quantity?: number }) => {
    if (!ensureAuthenticated()) {
      return;
    }

    const productId = String(newItem.backendProductId || '').trim();
    if (!productId) {
      addToast('San pham chua dong bo backend, khong the them vao gio hang.', 'error');
      return;
    }
    const itemStoreId = String(newItem.storeId || '').trim();
    if (userStoreId && itemStoreId && userStoreId === itemStoreId) {
      addToast(OWN_STORE_PURCHASE_MESSAGE, 'error');
      return;
    }

    const variantId = String(newItem.backendVariantId || '').trim() || undefined;
    const quantity = Math.max(1, Math.min(toPositiveQuantity(newItem.quantity), 10));

    enqueueMutation(async () => {
      try {
        const cart = await apiRequest<BackendCartResponse>(
          '/api/cart/items',
          {
            method: 'POST',
            body: JSON.stringify({
              productId,
              variantId,
              quantity,
            }),
          },
          { auth: true },
        );
        setItems(mapBackendCartToItems(cart));
      } catch (error) {
        addToast(toErrorMessage(error, 'Khong the them vao gio hang.'), 'error');
      }
    });
  }, [addToast, enqueueMutation, ensureAuthenticated, userStoreId]);

  const removeFromCart = useCallback((cartId: string) => {
    const normalized = String(cartId || '').trim();
    if (!normalized || !hasBackendSession) {
      return;
    }

    enqueueMutation(async () => {
      try {
        const cart = await apiRequest<BackendCartResponse>(
          `/api/cart/items/${encodeURIComponent(normalized)}`,
          { method: 'DELETE' },
          { auth: true },
        );
        setItems(mapBackendCartToItems(cart));
      } catch (error) {
        addToast(toErrorMessage(error, 'Khong the xoa san pham khoi gio hang.'), 'error');
      }
    });
  }, [addToast, enqueueMutation, hasBackendSession]);

  const updateQuantity = useCallback((cartId: string, quantity: number) => {
    const normalized = String(cartId || '').trim();
    if (!normalized || !hasBackendSession) {
      return;
    }
    if (quantity <= 0) {
      removeFromCart(normalized);
      return;
    }

    enqueueMutation(async () => {
      try {
        const cart = await apiRequest<BackendCartResponse>(
          `/api/cart/items/${encodeURIComponent(normalized)}?quantity=${encodeURIComponent(String(quantity))}`,
          { method: 'PUT' },
          { auth: true },
        );
        setItems(mapBackendCartToItems(cart));
      } catch (error) {
        addToast(toErrorMessage(error, 'Khong the cap nhat so luong.'), 'error');
      }
    });
  }, [addToast, enqueueMutation, hasBackendSession, removeFromCart]);

  const clearCart = useCallback(() => {
    if (!hasBackendSession) {
      setItems([]);
      return;
    }

    enqueueMutation(async () => {
      try {
        await apiRequest<void>('/api/cart', { method: 'DELETE' }, { auth: true });
        setItems([]);
      } catch (error) {
        addToast(toErrorMessage(error, 'Khong the xoa gio hang.'), 'error');
      }
    });
  }, [addToast, enqueueMutation, hasBackendSession]);

  const totalItems = items.length;
  const totalPrice = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items],
  );
  const groupedByStore = useCallback(() => normalizeStoreGroups(items), [items]);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
        groupedByStore,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextValue => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
};
