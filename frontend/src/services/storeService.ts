import { apiRequest } from './apiClient';
import { PLACEHOLDER_PRODUCT_IMAGE } from '../constants/placeholders';
import { resolveColorSwatch } from '../utils/colorSwatch';

export interface StoreProfile {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  banner?: string;
  description?: string;
  rating: number;
  totalOrders: number;
  totalSales: number;
  productCount?: number;
  liveProductCount?: number;
  responseRate?: number;
  isOfficial: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  applicantName?: string;
  applicantEmail?: string;
  commissionRate?: number;
  usesDefaultCommissionRate?: boolean;
  effectiveCommissionRate?: number;
  phone?: string;
  contactEmail?: string;
  address?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  bankVerified?: boolean;
  notifyNewOrder?: boolean;
  notifyOrderStatusChange?: boolean;
  notifyLowStock?: boolean;
  notifyPayoutComplete?: boolean;
  notifyPromotions?: boolean;
  shipGhn?: boolean;
  shipGhtk?: boolean;
  shipExpress?: boolean;
  warehouseAddress?: string;
  warehouseContact?: string;
  warehousePhone?: string;
  rejectionReason?: string;
}

export interface StoreProduct {
  id: number;
  backendId?: string;
  sku: string;
  name: string;
  slug?: string;
  price: number;
  originalPrice?: number;
  image: string;
  badge?: string;
  colors?: string[];
  sizes?: string[];
  variants?: Array<{
    color: string;
    colorHex?: string;
    size: string;
    backendId?: string;
  }>;
  stock: number;
  status: string;
  statusType: 'active' | 'low' | 'out';
  soldCount?: number;
  createdAt?: string;
  categoryId?: string;
  categoryName?: string;
  categorySlug?: string;
  storeId?: string;
  storeName?: string;
  storeSlug?: string;
  isOfficialStore?: boolean;
}

interface StoreProductsResponse {
  products: StoreProduct[];
  total: number;
  page: number;
  totalPages: number;
}

export type StoreProductSort = 'newest' | 'price_asc' | 'price_desc';

export interface StoreProductFilters {
  q?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: StoreProductSort;
}

export interface StoreRegistrationRequest {
  shopName: string;
  slug: string;
  category?: string;
  address: string;
  city?: string;
  district?: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

interface StoreUpdateRequest {
  name?: string;
  slug?: string;
  description?: string;
  logo?: string;
  banner?: string;
  contactEmail?: string;
  phone?: string;
  address?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  notifyNewOrder?: boolean;
  notifyOrderStatusChange?: boolean;
  notifyLowStock?: boolean;
  notifyPayoutComplete?: boolean;
  notifyPromotions?: boolean;
  shipGhn?: boolean;
  shipGhtk?: boolean;
  shipExpress?: boolean;
  warehouseAddress?: string;
  warehouseContact?: string;
  warehousePhone?: string;
}

interface AdminCommissionRateUpdateRequest {
  commissionRate: number;
  note?: string;
}

interface BackendUploadImageResponse {
  url?: string;
}

export interface StoreRegistrationResponse {
  storeId: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface ApproveStoreResponse {
  storeId: string;
  status: 'APPROVED';
}

export interface StoreLifecycleActionResponse {
  storeId: string;
  status: StoreProfile['status'];
}

interface BackendStoreResponse {
  id: string;
  ownerName?: string;
  ownerEmail?: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  banner?: string;
  contactEmail?: string;
  phone?: string;
  address?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  bankVerified?: boolean;
  notifyNewOrder?: boolean;
  notifyOrderStatusChange?: boolean;
  notifyLowStock?: boolean;
  notifyPayoutComplete?: boolean;
  notifyPromotions?: boolean;
  shipGhn?: boolean;
  shipGhtk?: boolean;
  shipExpress?: boolean;
  warehouseAddress?: string;
  warehouseContact?: string;
  warehousePhone?: string;
  commissionRate?: number;
  usesDefaultCommissionRate?: boolean;
  effectiveCommissionRate?: number;
  status: StoreProfile['status'];
  approvalStatus: StoreProfile['approvalStatus'];
  rejectionReason?: string;
  totalSales?: number;
  totalOrders?: number;
  rating?: number;
  productCount?: number;
  liveProductCount?: number;
  responseRate?: number;
  createdAt?: string;
}

interface BackendProductPage<T> {
  content?: T[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
}

interface BackendProduct {
  id: string;
  slug?: string;
  name?: string;
  viewCount?: number;
  soldCount?: number;
  createdAt?: string;
  basePrice?: number;
  salePrice?: number;
  status?: string;
  category?: { id?: string; name?: string; slug?: string };
  images?: Array<{ url?: string }>;
  variants?: Array<{ id?: string; sku?: string; color?: string; colorHex?: string; size?: string; stockQuantity?: number }>;
}

const normalizeColorKey = (value: string) => String(value || '').trim().toLowerCase();

const dedupeColorsBySwatch = (
  colors: string[] | undefined,
  variants: Array<{ color: string; colorHex?: string; size: string; backendId?: string }>,
): string[] => {
  const colorHexByName = new Map<string, string>();
  for (const variant of variants) {
    const colorName = normalizeColorKey(variant.color);
    const colorHex = String(variant.colorHex || '').trim().toLowerCase();
    if (!colorName || !colorHex || colorHexByName.has(colorName)) {
      continue;
    }
    colorHexByName.set(colorName, colorHex);
  }

  const sourceColors = (colors && colors.length > 0)
    ? colors
    : variants.map((variant) => variant.color);

  const seenSwatches = new Set<string>();
  const result: string[] = [];
  for (const rawColor of sourceColors) {
    const normalizedName = String(rawColor || '').trim();
    if (!normalizedName) {
      continue;
    }
    const swatchKey = resolveColorSwatch(
      colorHexByName.get(normalizeColorKey(normalizedName)) || normalizedName,
    ).toLowerCase();
    if (seenSwatches.has(swatchKey)) {
      continue;
    }
    seenSwatches.add(swatchKey);
    result.push(normalizedName);
  }

  return result;
};

const buildRegistrationDescription = (payload: StoreRegistrationRequest) =>
  [
    payload.category ? `Category: ${payload.category}` : null,
  ].filter(Boolean).join('\n');

const mapBackendStore = (store: BackendStoreResponse): StoreProfile => ({
  id: store.id,
  name: store.name,
  slug: store.slug,
  logo: store.logo,
  banner: store.banner,
  description: store.description,
  rating: Number(store.rating || 0),
  totalOrders: Number(store.totalOrders || 0),
  totalSales: Number(store.totalSales || 0),
  productCount: Number(store.productCount || 0),
  liveProductCount: Number(store.liveProductCount || 0),
  responseRate: Number(store.responseRate || 0),
  isOfficial: false,
  status: store.status,
  approvalStatus: store.approvalStatus,
  createdAt: store.createdAt || new Date().toISOString(),
  applicantName: store.ownerName,
  applicantEmail: store.ownerEmail,
  commissionRate: store.commissionRate != null ? Number(store.commissionRate) : undefined,
  usesDefaultCommissionRate: store.usesDefaultCommissionRate ?? false,
  effectiveCommissionRate: store.effectiveCommissionRate != null ? Number(store.effectiveCommissionRate) : undefined,
  phone: store.phone,
  contactEmail: store.contactEmail,
  address: store.address,
  bankName: store.bankName,
  bankAccountNumber: store.bankAccountNumber,
  bankAccountHolder: store.bankAccountHolder,
  bankVerified: Boolean(store.bankVerified),
  notifyNewOrder: store.notifyNewOrder ?? true,
  notifyOrderStatusChange: store.notifyOrderStatusChange ?? true,
  notifyLowStock: store.notifyLowStock ?? true,
  notifyPayoutComplete: store.notifyPayoutComplete ?? true,
  notifyPromotions: store.notifyPromotions ?? false,
  shipGhn: store.shipGhn ?? true,
  shipGhtk: store.shipGhtk ?? true,
  shipExpress: store.shipExpress ?? false,
  warehouseAddress: store.warehouseAddress,
  warehouseContact: store.warehouseContact,
  warehousePhone: store.warehousePhone,
  rejectionReason: store.rejectionReason,
});

const mapBackendProduct = (product: BackendProduct, store?: StoreProfile): StoreProduct => {
  const variants = product.variants || [];
  const variantOptions = variants
    .map((variant) => ({
      color: String(variant.color || '').trim(),
      colorHex: String(variant.colorHex || '').trim() || undefined,
      size: String(variant.size || '').trim(),
      backendId: variant.id,
    }))
    .filter((variant) => variant.color || variant.size);

  const stock = variants.reduce((sum, variant) => sum + Number(variant.stockQuantity || 0), 0);
  const price = Number(product.salePrice || product.basePrice || 0);
  const originalPrice = product.salePrice ? Number(product.basePrice || product.salePrice) : undefined;

  return {
    id: Number(product.id.replace(/\D/g, '')) || Date.now(),
    backendId: product.id,
    sku: variants[0]?.sku || product.slug || product.id,
    slug: product.slug,
    name: product.name || 'San pham',
    price,
    originalPrice,
    image: product.images?.[0]?.url || PLACEHOLDER_PRODUCT_IMAGE,
    colors: dedupeColorsBySwatch(
      Array.from(new Set(variantOptions.map((variant) => variant.color).filter(Boolean))),
      variantOptions,
    ),
    sizes: Array.from(new Set(variantOptions.map((variant) => variant.size).filter(Boolean))),
    variants: variantOptions
      .filter((variant) => Boolean(variant.color && variant.size))
      .map((variant) => ({
        color: variant.color,
        colorHex: variant.colorHex,
        size: variant.size,
        backendId: variant.backendId,
      })),
    stock,
    status: (product.status || 'ACTIVE').toLowerCase(),
    statusType: stock === 0 ? 'out' : stock < 10 ? 'low' : 'active',
    soldCount: Math.max(0, Number(product.soldCount ?? product.viewCount ?? 0)),
    createdAt: product.createdAt,
    categoryId: product.category?.id || undefined,
    categoryName: product.category?.name || undefined,
    categorySlug: product.category?.slug || undefined,
    storeId: store?.id,
    storeName: store?.name,
    storeSlug: store?.slug,
    isOfficialStore: store?.isOfficial,
  };
};

export const storeService = {
  async getStoreBySlug(slug: string): Promise<StoreProfile | null> {
    const store = await apiRequest<BackendStoreResponse>(`/api/stores/slug/${encodeURIComponent(slug)}`);
    return mapBackendStore(store);
  },

  async getStoreProducts(
    storeId: string,
    page = 1,
    limit = 12,
    filters: StoreProductFilters = {},
  ): Promise<StoreProductsResponse> {
    const params = new URLSearchParams({
      page: String(Math.max(page - 1, 0)),
      size: String(limit),
    });
    const keyword = String(filters.q || '').trim();
    if (keyword) params.set('q', keyword);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (Number.isFinite(filters.minPrice)) params.set('minPrice', String(Math.max(0, Number(filters.minPrice))));
    if (Number.isFinite(filters.maxPrice)) params.set('maxPrice', String(Math.max(0, Number(filters.maxPrice))));
    if (filters.sort) params.set('sort', filters.sort);

    const [store, productPage] = await Promise.all([
      this.getStoreById(storeId),
      apiRequest<BackendProductPage<BackendProduct>>(`/api/products/store/${storeId}?${params.toString()}`),
    ]);

    const products = (productPage.content || []).map((product) => mapBackendProduct(product, store || undefined));
    return {
      products,
      total: Number(productPage.totalElements || products.length),
      page: Number(productPage.number || 0) + 1,
      totalPages: Number(productPage.totalPages || 1),
    };
  },

  async getStoreById(id: string): Promise<StoreProfile | null> {
    const store = await apiRequest<BackendStoreResponse>(`/api/stores/${id}`);
    return mapBackendStore(store);
  },

  async getAllStores(): Promise<StoreProfile[]> {
    const stores = await apiRequest<BackendStoreResponse[]>('/api/stores');
    return stores.map(mapBackendStore);
  },

  async getAdminStores(): Promise<StoreProfile[]> {
    const stores = await apiRequest<BackendStoreResponse[]>('/api/stores/admin', {}, { auth: true });
    return stores.map(mapBackendStore);
  },

  async getPendingStores(): Promise<StoreProfile[]> {
    const stores = await apiRequest<BackendStoreResponse[]>('/api/stores/pending', {}, { auth: true });
    return stores.map(mapBackendStore);
  },

  async getMyStore(): Promise<StoreProfile> {
    const store = await apiRequest<BackendStoreResponse>('/api/stores/my-store', {}, { auth: true });
    return mapBackendStore(store);
  },

  async registerStore(payload: StoreRegistrationRequest): Promise<StoreRegistrationResponse> {
    const store = await apiRequest<BackendStoreResponse>('/api/stores/register', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.shopName,
        slug: payload.slug,
        description: buildRegistrationDescription(payload),
        contactEmail: payload.contactEmail,
        phone: payload.contactPhone,
        address: [payload.address, payload.district, payload.city].filter(Boolean).join(', '),
      }),
    }, { auth: true });

    return {
      storeId: store.id,
      approvalStatus: store.approvalStatus,
    };
  },

  async approveStore(storeId: string): Promise<ApproveStoreResponse> {
    const store = await apiRequest<BackendStoreResponse>(`/api/stores/${storeId}/approve`, {
      method: 'POST',
    }, { auth: true });

    return {
      storeId: store.id,
      status: 'APPROVED',
    };
  },

  async rejectStore(storeId: string, reason: string): Promise<{ status: 'REJECTED' }> {
    await apiRequest<BackendStoreResponse>(`/api/stores/${storeId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }, { auth: true });
    return { status: 'REJECTED' };
  },

  async suspendStore(storeId: string): Promise<StoreLifecycleActionResponse> {
    const store = await apiRequest<BackendStoreResponse>(`/api/stores/${storeId}/suspend`, {
      method: 'POST',
    }, { auth: true });

    return {
      storeId: store.id,
      status: store.status,
    };
  },

  async reactivateStore(storeId: string): Promise<StoreLifecycleActionResponse> {
    const store = await apiRequest<BackendStoreResponse>(`/api/stores/${storeId}/reactivate`, {
      method: 'POST',
    }, { auth: true });

    return {
      storeId: store.id,
      status: store.status,
    };
  },

  async updateStoreCommissionRate(storeId: string, payload: AdminCommissionRateUpdateRequest): Promise<StoreProfile> {
    const store = await apiRequest<BackendStoreResponse>(`/api/stores/${storeId}/commission-rate`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, { auth: true });
    return mapBackendStore(store);
  },

  async resetStoreCommissionRateToDefault(storeId: string): Promise<StoreProfile> {
    const store = await apiRequest<BackendStoreResponse>(`/api/stores/${storeId}/commission-rate/default`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    }, { auth: true });
    return mapBackendStore(store);
  },

  async updateMyStore(payload: StoreUpdateRequest): Promise<StoreProfile> {
    const store = await apiRequest<BackendStoreResponse>('/api/stores/my-store', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }, { auth: true });
    return mapBackendStore(store);
  },

  async uploadStoreImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiRequest<BackendUploadImageResponse>(
      '/api/stores/upload-image',
      {
        method: 'POST',
        body: formData,
      },
      { auth: true },
    );

    const nextUrl = String(response?.url || '').trim();
    if (!nextUrl) {
      throw new Error('Không nhận được URL ảnh sau khi tải lên.');
    }
    return nextUrl;
  },
};
