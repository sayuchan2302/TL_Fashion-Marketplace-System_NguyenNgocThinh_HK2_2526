import { apiRequest } from './apiClient';
import { getOptimizedImageUrl } from '../utils/getOptimizedImageUrl';
import { PLACEHOLDER_PRODUCT_IMAGE } from '../constants/placeholders';

interface BackendCategoryOption {
  id?: string;
  name?: string;
  label?: string;
  parentId?: string | null;
  leaf?: boolean;
  depth?: number;
}

interface BackendVendorProduct {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  sizeAndFit?: string;
  fabricAndCare?: string;
  highlights?: string;
  material?: string;
  careInstructions?: string;
  status?: string;
  approvalStatus?: string;
  moderationReason?: string;
  visible?: boolean;
  fit?: string;
  gender?: string;
  categoryId?: string;
  categoryName?: string;
  basePrice?: number;
  salePrice?: number;
  effectivePrice?: number;
  totalStock?: number;
  soldCount?: number;
  grossRevenue?: number;
  primarySku?: string;
  primaryImage?: string;
  images?: string[];
  variants?: BackendVendorVariant[];
}

interface BackendVendorVariant {
  id?: string;
  sku?: string;
  color?: string;
  colorHex?: string;
  size?: string;
  stockQuantity?: number;
  priceAdjustment?: number;
  isActive?: boolean;
}

interface BackendVendorProductPage {
  content?: BackendVendorProduct[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
  statusCounts?: {
    all?: number;
    active?: number;
    draft?: number;
    outOfStock?: number;
    lowStock?: number;
    banned?: number;
  };
}

interface BackendProductRequest {
  name?: string;
  slug?: string;
  description?: string;
  sizeAndFit?: string;
  fabricAndCare?: string;
  highlights?: string;
  material?: string;
  careInstructions?: string;
  categoryId?: string;
  basePrice?: number;
  salePrice?: number;
  fit?: string;
  gender?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'ARCHIVED';
  sku?: string;
  stockQuantity?: number;
  imageUrl?: string;
  imageUrls?: string[];
  variants?: Array<{
    sku?: string;
    color: string;
    colorHex?: string;
    size: string;
    stockQuantity: number;
    priceAdjustment: number;
    isActive: boolean;
  }>;
}

export type VendorProductStatus = 'active' | 'low' | 'out' | 'draft' | 'banned' | 'review';

export interface VendorProductRecord {
  id: string;
  slug: string;
  name: string;
  sku: string;
  category: string;
  categoryId?: string;
  sizeAndFit: string;
  fabricAndCare: string;
  material: string;
  highlights: string;
  careInstructions: string;
  fit?: string;
  gender?: string;
  price: number;
  basePrice?: number;
  salePrice?: number;
  stock: number;
  sold: number;
  grossRevenue: number;
  status: VendorProductStatus;
  approvalStatus?: string;
  moderationReason?: string;
  visible: boolean;
  canToggleVisibility: boolean;
  image: string;
  images: string[];
  description: string;
  variants: VendorProductVariant[];
}

export interface VendorProductCategory {
  id: string;
  name: string;
  label: string;
  parentId: string | null;
  leaf: boolean;
  depth: number;
}

export interface VendorProductUpsertInput {
  name: string;
  categoryId?: string;
  price: number;
  basePrice?: number;
  salePrice?: number;
  stock: number;
  description?: string;
  sizeAndFit?: string;
  fabricAndCare?: string;
  highlights?: string;
  material?: string;
  careInstructions?: string;
  fit?: string;
  gender?: string;
  image?: string;
  images?: string[];
  visible: boolean;
  slug?: string;
  variants?: VendorProductVariantInput[];
}

interface BackendUploadImageResponse {
  url?: string;
}

export interface VendorProductVariant {
  id?: string;
  sku: string;
  color: string;
  colorHex?: string;
  size: string;
  stockQuantity: number;
  priceAdjustment: number;
  isActive: boolean;
}

export interface VendorProductVariantInput {
  color: string;
  colorHex?: string;
  size: string;
  stockQuantity: number;
  priceAdjustment?: number;
  isActive?: boolean;
}

export interface VendorProductPageResult {
  items: VendorProductRecord[];
  totalElements: number;
  totalPages: number;
  page: number;
  pageSize: number;
  statusCounts: {
    all: number;
    active: number;
    draft: number;
    outOfStock: number;
    lowStock: number;
    banned: number;
  };
}

export interface VendorProductQuery {
  status?: 'all' | 'active' | 'draft' | 'outOfStock' | 'banned';
  page?: number;
  size?: number;
  keyword?: string;
  categoryId?: string;
  sortBy?: string;
  sortOrder?: string;
}

const FALLBACK_IMAGE = PLACEHOLDER_PRODUCT_IMAGE;
const PRODUCT_PAGE_SIZE = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value?: string) => Boolean(value && UUID_PATTERN.test(value));

const normalizeText = (value?: string) => (value || '').trim();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const isApprovedForSale = (approvalStatus?: string) => {
  const normalized = (approvalStatus || 'APPROVED').toUpperCase();
  return normalized === 'APPROVED';
};

const toVendorStatus = (
  backendStatus: string | undefined,
  stock: number,
  approvalStatus?: string,
): VendorProductStatus => {
  const approval = (approvalStatus || 'APPROVED').toUpperCase();
  if (approval === 'BANNED' || approval === 'REJECTED') {
    return 'banned';
  }
  if (approval === 'PENDING' || approval === 'UNDER_REVIEW') {
    return 'review';
  }

  const normalized = (backendStatus || '').toUpperCase();
  if (normalized === 'DRAFT' || normalized === 'INACTIVE' || normalized === 'ARCHIVED') {
    return 'draft';
  }
  if (stock <= 0) {
    return 'out';
  }
  if (stock < 10) {
    return 'low';
  }
  return 'active';
};

const mapBackendProduct = (product: BackendVendorProduct): VendorProductRecord => {
  const stock = Math.max(0, Number(product.totalStock || 0));
  const approvalStatus = normalizeText(product.approvalStatus || 'APPROVED').toUpperCase();
  const status = toVendorStatus(product.status, stock, approvalStatus);
  const canToggleVisibility = isApprovedForSale(approvalStatus);
  const fallbackSku = normalizeText(product.slug) || product.id;
  const variants = (product.variants || [])
    .map((variant): VendorProductVariant | null => {
      const sku = normalizeText(variant.sku);
      if (!sku) {
        return null;
      }
      return {
        id: variant.id,
        sku,
        color: normalizeText(variant.color) || 'Default',
        colorHex: normalizeText(variant.colorHex) || undefined,
        size: normalizeText(variant.size) || 'Default',
        stockQuantity: Math.max(0, Number(variant.stockQuantity || 0)),
        priceAdjustment: Number(variant.priceAdjustment || 0),
        isActive: variant.isActive !== false,
      };
    })
    .filter((variant): variant is VendorProductVariant => Boolean(variant));

  const normalizedVariants = variants.length > 0
    ? variants
    : [{
      sku: normalizeText(product.primarySku) || fallbackSku,
      color: 'Default',
      colorHex: undefined,
      size: 'Default',
      stockQuantity: stock,
      priceAdjustment: 0,
      isActive: true,
    }];

  const normalizedImages = (product.images || [])
    .map((value) => normalizeText(value))
    .filter((value) => Boolean(value))
    .map((value) => getOptimizedImageUrl(value, { width: 520, format: 'webp', quality: 74 }))
    .filter((value): value is string => Boolean(value));

  const primaryImage = getOptimizedImageUrl(normalizeText(product.primaryImage), { width: 520, format: 'webp', quality: 74 });
  if (primaryImage && !normalizedImages.includes(primaryImage)) {
    normalizedImages.unshift(primaryImage);
  }
  if (normalizedImages.length === 0) {
    normalizedImages.push(getOptimizedImageUrl(FALLBACK_IMAGE, { width: 520, format: 'webp', quality: 74 }) || FALLBACK_IMAGE);
  }

  return {
    id: product.id,
    slug: normalizeText(product.slug) || fallbackSku,
    name: normalizeText(product.name) || 'Sản phẩm mới',
    sku: normalizeText(product.primarySku) || fallbackSku,
    category: normalizeText(product.categoryName) || 'Chưa phân loại',
    categoryId: product.categoryId,
    sizeAndFit: normalizeText(product.sizeAndFit || product.highlights),
    fabricAndCare: normalizeText(product.fabricAndCare || product.careInstructions || product.material),
    material: normalizeText(product.material),
    highlights: normalizeText(product.highlights),
    careInstructions: normalizeText(product.careInstructions),
    fit: normalizeText(product.fit),
    gender: normalizeText(product.gender),
    price: Number(product.effectivePrice || product.salePrice || product.basePrice || 0),
    basePrice: Number(product.basePrice || 0),
    salePrice: Number(product.salePrice || 0),
    stock,
    sold: Number(product.soldCount || 0),
    grossRevenue: Number(product.grossRevenue || 0),
    status,
    approvalStatus,
    moderationReason: normalizeText(product.moderationReason),
    visible: canToggleVisibility && Boolean(product.visible),
    canToggleVisibility,
    image: normalizedImages[0],
    images: normalizedImages,
    description: normalizeText(product.description),
    variants: normalizedVariants,
  };
};

const mapCategories = (rows: BackendCategoryOption[]): VendorProductCategory[] => {
  return rows
    .filter((row) => row.id && normalizeText(row.name))
    .map((row) => ({
      id: String(row.id),
      name: normalizeText(row.name),
      label: normalizeText(row.label) || normalizeText(row.name),
      parentId: row.parentId ? String(row.parentId) : null,
      leaf: row.leaf ?? true,
      depth: Number(row.depth ?? 0),
    }))
    .sort((left, right) => left.depth - right.depth || left.label.localeCompare(right.label, 'vi'));
};

const toRequestPayload = (
  input: VendorProductUpsertInput,
  options?: { forceStatus?: 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'ARCHIVED' },
): BackendProductRequest => {
  const normalizedName = normalizeText(input.name);
  const timestamp = Date.now();
  const normalizedSlug =
    normalizeText(input.slug) || slugify(`${normalizedName}-${timestamp}`) || `sp-${timestamp}`;
  const normalizedImage = normalizeText(input.image);
  const normalizedImages = Array.from(new Set((input.images || [])
    .map((value) => normalizeText(value))
    .filter((value) => Boolean(value))));
  if (normalizedImages.length === 0 && normalizedImage) {
    normalizedImages.push(normalizedImage);
  }
  const normalizedSizeAndFit = normalizeText(input.sizeAndFit || input.highlights);
  const normalizedFabricAndCare = normalizeText(input.fabricAndCare)
    || [normalizeText(input.material), normalizeText(input.careInstructions)].filter(Boolean).join('\n');
  const normalizedMaterial = normalizeText(input.material);

  return {
    name: normalizedName,
    slug: normalizedSlug,
    description: normalizeText(input.description),
    sizeAndFit: normalizedSizeAndFit,
    fabricAndCare: normalizedFabricAndCare,
    highlights: normalizedSizeAndFit,
    material: normalizedMaterial,
    careInstructions: normalizedFabricAndCare,
    categoryId: isUuid(input.categoryId) ? input.categoryId : undefined,
    basePrice: Math.max(0, Number(input.basePrice ?? input.price ?? 0)),
    salePrice: Math.max(0, Number(input.salePrice ?? 0)),
    fit: normalizeText(input.fit) || undefined,
    gender: normalizeText(input.gender) || undefined,
    status: options?.forceStatus || (input.visible ? 'ACTIVE' : 'DRAFT'),
    stockQuantity: Math.max(0, Number(input.stock || 0)),
    imageUrl: normalizedImages[0] || undefined,
    imageUrls: normalizedImages.length > 0 ? normalizedImages : undefined,
    variants: (input.variants || [])
      .map((variant) => ({
        color: normalizeText(variant.color) || 'Default',
        colorHex: normalizeText(variant.colorHex) || undefined,
        size: normalizeText(variant.size) || 'Default',
        stockQuantity: Math.max(0, Number(variant.stockQuantity || 0)),
        priceAdjustment: Number(variant.priceAdjustment || 0),
        isActive: variant.isActive !== false,
      })),
  };
};

const statusToBackend = (status?: VendorProductQuery['status']) => {
  if (!status || status === 'all') return undefined;
  if (status === 'active') return 'ACTIVE';
  if (status === 'draft') return 'DRAFT';
  if (status === 'banned') return undefined;
  return 'ACTIVE';
};

const approvalStatusToBackend = (status?: VendorProductQuery['status']) => {
  if (status === 'banned') return 'BANNED';
  return undefined;
};

const inventoryToBackend = (status?: VendorProductQuery['status']) => {
  if (status === 'outOfStock') return 'OUT';
  return undefined;
};

export const vendorProductService = {
  async getCategories(): Promise<VendorProductCategory[]> {
    const categories = await apiRequest<BackendCategoryOption[]>(
      '/api/categories/options',
      {},
      { auth: true },
    ).catch(() => []);
    return mapCategories(categories);
  },

  async getProducts(params: VendorProductQuery = {}): Promise<VendorProductPageResult> {
    const page = Math.max(0, (params.page ?? 1) - 1);
    const size = params.size ?? 10;

    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('size', String(size));

    const backendStatus = statusToBackend(params.status);
    if (backendStatus) searchParams.set('status', backendStatus);

    const approvalStatus = approvalStatusToBackend(params.status);
    if (approvalStatus) searchParams.set('approval_status', approvalStatus);

    const inventory = inventoryToBackend(params.status);
    if (inventory) searchParams.set('inventory', inventory);

    if (params.keyword?.trim()) searchParams.set('q', params.keyword.trim());
    if (params.categoryId && isUuid(params.categoryId)) searchParams.set('category_id', params.categoryId);
    if (params.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

    const response = await apiRequest<BackendVendorProductPage>(
      `/api/products/my-store?${searchParams.toString()}`,
      {},
      { auth: true },
    );

    const content = response.content || [];
    const statusCounts = response.statusCounts || {};
    return {
      items: content.map(mapBackendProduct),
      totalElements: Number(response.totalElements ?? content.length),
      totalPages: Number(response.totalPages ?? 1),
      page: Number(response.number ?? page) + 1,
      pageSize: Number(response.size ?? size),
      statusCounts: {
        all: Number(statusCounts.all || 0),
        active: Number(statusCounts.active || 0),
        draft: Number(statusCounts.draft || 0),
        outOfStock: Number(statusCounts.outOfStock || 0),
        lowStock: Number(statusCounts.lowStock || 0),
        banned: Number(statusCounts.banned || 0),
      },
    };
  },

  async getSnapshot(): Promise<{ products: VendorProductRecord[]; categories: VendorProductCategory[] }> {
    const [firstPage, categories] = await Promise.all([
      this.getProducts({ page: 1, size: PRODUCT_PAGE_SIZE }),
      this.getCategories(),
    ]);

    let items = [...firstPage.items];
    const totalPages = Math.max(firstPage.totalPages, 1);
    if (totalPages > 1) {
      const requests: Array<Promise<VendorProductPageResult>> = [];
      for (let nextPage = 2; nextPage <= totalPages; nextPage += 1) {
        requests.push(this.getProducts({ page: nextPage, size: PRODUCT_PAGE_SIZE }));
      }
      const pages = await Promise.all(requests);
      items = items.concat(pages.flatMap((page) => page.items));
    }

    return {
      products: items,
      categories,
    };
  },

  async createProduct(input: VendorProductUpsertInput): Promise<VendorProductRecord> {
    const payload = toRequestPayload(input);
    const created = await apiRequest<BackendVendorProduct>(
      '/api/products',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { auth: true },
    );

    return mapBackendProduct(created);
  },

  async updateProduct(id: string, input: VendorProductUpsertInput): Promise<VendorProductRecord> {
    const payload = toRequestPayload(input);
    const updated = await apiRequest<BackendVendorProduct>(
      `/api/products/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      { auth: true },
    );

    return mapBackendProduct(updated);
  },

  async uploadProductImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiRequest<BackendUploadImageResponse>(
      '/api/products/upload-image',
      {
        method: 'POST',
        body: formData,
      },
      { auth: true },
    );

    const url = normalizeText(response?.url);
    if (!url) {
      throw new Error('Không nhận được URL ảnh sau khi tải lên.');
    }
    return url;
  },

  async setVisibility(id: string, visible: boolean): Promise<VendorProductRecord> {
    const updated = await apiRequest<BackendVendorProduct>(
      `/api/products/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: visible ? 'ACTIVE' : 'DRAFT' }),
      },
      { auth: true },
    );

    return mapBackendProduct(updated);
  },

  async deleteProduct(id: string): Promise<void> {
    await apiRequest<void>(
      `/api/products/${id}`,
      {
        method: 'DELETE',
      },
      { auth: true },
    );
  },
};
