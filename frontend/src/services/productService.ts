import { apiRequest } from './apiClient';
import { storeService } from './storeService';
import type { Product, ProductVariant, ProductStatusType } from '../types';
import { normalizeStoreSlug } from '../utils/storeIdentity';
import { getOptimizedImageUrl } from '../utils/getOptimizedImageUrl';
import { resolveColorSwatch } from '../utils/colorSwatch';
import {
  listAdminProducts,
  listAdminProductsSnapshot,
  type AdminProductRecord,
} from '../pages/Admin/adminProductService';

const colorHexMatch = (selected: string, productColor: string): boolean => {
  const normalize = (c: string) => c.toLowerCase().trim();
  return normalize(selected).includes(normalize(productColor)) ||
    normalize(productColor).includes(normalize(selected));
};

export interface ProductFilter {
  query?: string;
  priceRanges?: string[];
  sizes?: string[];
  colors?: string[];
  sortBy?: 'newest' | 'bestseller' | 'price-asc' | 'price-desc' | 'discount';
  categoryId?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
}

interface ResolvePurchaseReferenceOptions {
  forceRefresh?: boolean;
  strictPublic?: boolean;
}

interface BackendProductImage {
  url?: string;
  isPrimary?: boolean;
}

interface BackendProductVariant {
  id?: string;
  sku?: string;
  color?: string;
  colorHex?: string;
  size?: string;
  stockQuantity?: number;
  priceAdjustment?: number;
}

interface BackendCategory {
  name?: string;
  slug?: string;
}

interface BackendProduct {
  id: string;
  slug?: string;
  name?: string;
  description?: string;
  sizeAndFit?: string;
  fabricAndCare?: string;
  highlights?: string;
  material?: string;
  fit?: string;
  gender?: string;
  careInstructions?: string;
  category?: BackendCategory;
  basePrice?: number;
  salePrice?: number;
  status?: string;
  images?: BackendProductImage[];
  variants?: BackendProductVariant[];
  storeId?: string;
  storeName?: string;
  storeSlug?: string;
  storeLogo?: string;
  isOfficialStore?: boolean;
  soldCount?: number;
}

interface StoreMeta {
  name?: string;
  slug?: string;
  logo?: string;
  isOfficial?: boolean;
}

const STORE_ASSIGNMENTS = [
  {
    storeId: 'store-001',
    storeName: 'Fashion Hub',
    storeSlug: 'fashion-hub',
    storeLogo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=200&h=200&fit=crop',
    isOfficialStore: true,
  },
  {
    storeId: 'store-002',
    storeName: 'Style Shop',
    storeSlug: 'style-shop',
    storeLogo: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=200&fit=crop',
    isOfficialStore: false,
  },
];

const PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: 'men', name: 'Thoi Trang Nam', slug: 'men' },
  { id: 'women', name: 'Thoi Trang Nu', slug: 'women' },
  { id: 'sale', name: 'San Pham Khuyen Mai', slug: 'sale' },
  { id: 'new', name: 'San Pham Moi', slug: 'new' },
  { id: 'accessories', name: 'Phu Kien', slug: 'accessories' },
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_NUMERIC_ID_PATTERN = /^\d+$/;
const LIKELY_SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const LIKELY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const storeMetaCache = new Map<string, StoreMeta | null>();

const mapStatusType = (statusType: string): ProductStatusType => {
  if (statusType === 'low') return 'low';
  if (statusType === 'out') return 'out';
  return 'active';
};

const optimizeProductImage = (rawUrl: string | null | undefined, width: number) =>
  getOptimizedImageUrl(rawUrl, { width, format: 'webp', quality: 74 });

const dedupeColorsBySwatch = (variants: ProductVariant[]): string[] => {
  const seenSwatches = new Set<string>();
  const result: string[] = [];
  for (const variant of variants) {
    const colorName = String(variant.color || '').trim();
    if (!colorName) {
      continue;
    }
    const swatchKey = resolveColorSwatch(variant.colorHex || colorName).toLowerCase();
    if (seenSwatches.has(swatchKey)) {
      continue;
    }
    seenSwatches.add(swatchKey);
    result.push(colorName);
  }
  return result;
};

const mapAdminProductToClient = (record: AdminProductRecord, index: number): Product => {
  const variantRows = Array.isArray(record.variantMatrix) ? record.variantMatrix : [];
  const variants: ProductVariant[] = variantRows.map((row) => ({
    id: row.id,
    size: row.size,
    color: row.color,
    sku: row.sku,
    price: Number(row.price) || record.price,
    stock: Number.parseInt((row.stock || '').replace(/\D/g, ''), 10) || 0,
  }));

  const storeInfo = STORE_ASSIGNMENTS[index % STORE_ASSIGNMENTS.length];

  return {
    id: record.sku,
    sku: record.sku,
    name: record.name,
    category: record.category,
    price: Number(record.price || 0),
    originalPrice: Number(record.price || 0),
    image: optimizeProductImage(record.thumb, 520) || record.thumb || '',
    badge: record.statusType === 'low' ? 'LOW' : undefined,
    colors: Array.from(new Set(variantRows.map((v) => v.color))).map((color) => color),
    stock: Number(record.stock || 0),
    status: record.status || 'ACTIVE',
    statusType: mapStatusType(record.statusType || 'active'),
    variants,
    storeId: storeInfo.storeId,
    storeName: storeInfo.storeName,
    storeSlug: storeInfo.storeSlug,
    storeLogo: storeInfo.storeLogo,
    isOfficialStore: storeInfo.isOfficialStore,
  };
};

const listFromAdminSnapshot = (): Product[] => listAdminProductsSnapshot().map(mapAdminProductToClient);
const loadFromAdmin = async (): Promise<Product[]> => (await listAdminProducts()).map(mapAdminProductToClient);

const sortImages = (images?: BackendProductImage[]) =>
  [...(images || [])].sort((left, right) =>
    Number(Boolean(right?.isPrimary)) - Number(Boolean(left?.isPrimary)));

const mapBackendProduct = (product: BackendProduct): Product => {
  const variants = (product.variants || []).map((variant): ProductVariant => ({
    id: variant.sku || variant.id || `${product.slug || product.id}-${variant.color || 'default'}-${variant.size || 'default'}`,
    backendId: variant.id,
    size: variant.size || '',
    color: variant.color || '',
    colorHex: (variant.colorHex || '').trim() || undefined,
    sku: variant.sku || '',
    price: (product.salePrice || product.basePrice || 0) + (variant.priceAdjustment || 0),
    stock: variant.stockQuantity || 0,
  }));

  const colors = dedupeColorsBySwatch(variants);
  const sizes = Array.from(new Set(variants.map((variant) => variant.size).filter(Boolean)));
  const sortedImages = sortImages(product.images);
  const imageUrls = sortedImages
    .map((image) => (image?.url || '').trim())
    .map((url) => optimizeProductImage(url, 720) || url)
    .filter(Boolean);
  const storeInfo = product.storeId
    ? {
        storeId: product.storeId,
        storeName: product.storeName || 'Marketplace Store',
        storeSlug: normalizeStoreSlug(product.storeSlug),
        storeLogo: product.storeLogo,
        isOfficialStore: Boolean(product.isOfficialStore),
      }
    : undefined;

  return {
    id: product.slug || product.id,
    backendId: product.id,
    sku: product.slug || product.id,
    name: product.name || 'Unnamed product',
    description: product.description,
    sizeAndFit: product.sizeAndFit || product.highlights,
    fabricAndCare: product.fabricAndCare || product.careInstructions || product.material,
    highlights: product.highlights,
    material: product.material,
    fit: product.fit,
    gender: product.gender,
    careInstructions: product.careInstructions,
    category: product.category?.name || 'Fashion',
    categorySlug: product.category?.slug,
    price: product.salePrice || product.basePrice || 0,
    originalPrice: product.basePrice || undefined,
    image: imageUrls[0] || '',
    images: imageUrls,
    colors,
    sizes,
    stock: variants.reduce((sum, variant) => sum + (variant.stock || 0), 0),
    sold: Math.max(0, Number(product.soldCount || 0)),
    status: product.status || 'ACTIVE',
    statusType: variants.some((variant) => (variant.stock || 0) <= 0)
      ? 'low'
      : 'active',
    variants,
    ...storeInfo,
  };
};

const productCache = new Map<string, Product>();

const loadStoreMeta = async (storeId: string): Promise<StoreMeta | null> => {
  if (storeMetaCache.has(storeId)) {
    return storeMetaCache.get(storeId) || null;
  }

  try {
    const store = await storeService.getStoreById(storeId);
    const meta: StoreMeta | null = store
      ? {
          name: store.name,
          slug: store.slug,
          logo: store.logo,
          isOfficial: store.isOfficial,
        }
      : null;
    storeMetaCache.set(storeId, meta);
    return meta;
  } catch {
    storeMetaCache.set(storeId, null);
    return null;
  }
};

const enrichProductsWithStoreMeta = async (products: Product[]): Promise<Product[]> => {
  const needsEnrich = Array.from(new Set(
    products
      .filter((product) =>
        Boolean(
          product.storeId
          && (!normalizeStoreSlug(product.storeSlug) || !product.storeName || product.storeName === 'Marketplace Store'),
        ))
      .map((product) => product.storeId as string),
  ));

  if (needsEnrich.length > 0) {
    await Promise.all(needsEnrich.map((storeId) => loadStoreMeta(storeId)));
  }

  return products.map((product) => {
    if (!product.storeId) {
      return product;
    }
    const meta = storeMetaCache.get(product.storeId) || null;
    if (!meta) {
      return {
        ...product,
        storeSlug: normalizeStoreSlug(product.storeSlug),
      };
    }

    return {
      ...product,
      storeName: product.storeName && product.storeName !== 'Marketplace Store'
        ? product.storeName
        : (meta.name || product.storeName),
      storeSlug: normalizeStoreSlug(product.storeSlug) || normalizeStoreSlug(meta.slug),
      storeLogo: product.storeLogo || meta.logo,
      isOfficialStore: product.isOfficialStore ?? meta.isOfficial,
    };
  });
};

const cacheProducts = (products: Product[]) => {
  for (const product of products) {
    productCache.set(String(product.id), product);
    productCache.set(product.sku, product);
    if (product.backendId) {
      productCache.set(product.backendId, product);
    }
  }
};

const getCachedProducts = () => Array.from(new Set(productCache.values()));

const getCachedProduct = (identifier: number | string) => {
  const normalized = String(identifier);
  return productCache.get(normalized) || null;
};

const filterProductsLocally = (source: Product[], filter: ProductFilter): Product[] => {
  let results = [...source];

  if (filter.query?.trim()) {
    const normalizedQuery = filter.query.toLowerCase().normalize('NFC').trim();
    const words = normalizedQuery.split(/\s+/).filter((word) => word.length >= 2);
    if (words.length > 0) {
      results = results.filter((product) => {
        const searchableText = [product.name, product.badge || '', product.category || '']
          .join(' ')
          .toLowerCase()
          .normalize('NFC');
        return words.every((word) => searchableText.includes(word));
      });
    }
  }

  if (filter.categoryId !== undefined) {
    results = results.filter((product) =>
      (product.category || '').toLowerCase().includes(filter.categoryId!.toLowerCase()));
  }

  if (filter.priceRanges?.length) {
    results = results.filter((product) =>
      filter.priceRanges!.some((range) => {
        if (range === 'under-200k') return product.price < 200000;
        if (range === 'from-200k-500k') return product.price >= 200000 && product.price <= 500000;
        if (range === 'over-500k') return product.price > 500000;
        return false;
      }));
  }

  if (filter.colors?.length) {
    results = results.filter((product) =>
      product.colors && product.colors.length > 0 &&
      filter.colors!.some((selectedColor) =>
        product.colors!.some((productColor) => colorHexMatch(selectedColor, productColor))));
  }

  switch (filter.sortBy) {
    case 'price-asc':
      results.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      results.sort((a, b) => b.price - a.price);
      break;
    case 'discount':
      results.sort((a, b) => {
        const discountA = a.originalPrice ? ((a.originalPrice - a.price) / a.originalPrice) * 100 : 0;
        const discountB = b.originalPrice ? ((b.originalPrice - b.price) / b.originalPrice) * 100 : 0;
        return discountB - discountA;
      });
      break;
    default:
      break;
  }

  return results;
};

const fetchProductBySlug = async (slug: string): Promise<Product | null> => {
  try {
    const backendProduct = await apiRequest<BackendProduct>(`/api/products/slug/${encodeURIComponent(slug)}`);
    const [mapped] = await enrichProductsWithStoreMeta([mapBackendProduct(backendProduct)]);
    cacheProducts([mapped]);
    return mapped;
  } catch {
    return null;
  }
};

const fetchProductBySku = async (sku: string): Promise<Product | null> => {
  try {
    const backendProduct = await apiRequest<BackendProduct>(`/api/products/sku/${encodeURIComponent(sku)}`);
    const [mapped] = await enrichProductsWithStoreMeta([mapBackendProduct(backendProduct)]);
    cacheProducts([mapped]);
    return mapped;
  } catch {
    return null;
  }
};

const fetchProductByBackendId = async (id: string): Promise<Product | null> => {
  try {
    const backendProduct = await apiRequest<BackendProduct>(`/api/products/${id}`);
    const [mapped] = await enrichProductsWithStoreMeta([mapBackendProduct(backendProduct)]);
    cacheProducts([mapped]);
    return mapped;
  } catch {
    return null;
  }
};

const fetchStrictPublicProductByBackendId = async (id: string): Promise<Product | null> => {
  try {
    const backendProducts = await apiRequest<BackendProduct[]>('/api/products');
    const matched = backendProducts.find((product) => product.id === id);
    if (!matched) {
      return null;
    }
    const [mapped] = await enrichProductsWithStoreMeta([mapBackendProduct(matched)]);
    cacheProducts([mapped]);
    return mapped;
  } catch {
    return null;
  }
};

const fetchProductByIdentifier = async (identifier: string): Promise<Product | null> => {
  const normalized = identifier.trim();
  if (!normalized) {
    return null;
  }

  if (UUID_PATTERN.test(normalized)) {
    return fetchProductByBackendId(normalized);
  }

  if (LEGACY_NUMERIC_ID_PATTERN.test(normalized)) {
    return null;
  }

  const looksLikeSku = LIKELY_SKU_PATTERN.test(normalized);
  const looksLikeSlug = LIKELY_SLUG_PATTERN.test(normalized);

  if (looksLikeSku && !looksLikeSlug) {
    const bySku = await fetchProductBySku(normalized);
    if (bySku) {
      return bySku;
    }
    return fetchProductBySlug(normalized);
  }

  const bySlug = await fetchProductBySlug(normalized);
  if (bySlug) {
    return bySlug;
  }

  return fetchProductBySku(normalized);
};

const fetchPublicCatalog = async (): Promise<Product[]> => {
  try {
    const backendProducts = await apiRequest<BackendProduct[]>('/api/products');
    const mapped = await enrichProductsWithStoreMeta(backendProducts.map(mapBackendProduct));
    cacheProducts(mapped);
    return mapped;
  } catch {
    const fallback = await loadFromAdmin();
    cacheProducts(fallback);
    return fallback;
  }
};

export const productService = {
  PRODUCT_CATEGORIES,

  list(): Product[] {
    const cached = getCachedProducts();
    if (cached.length > 0) {
      return cached;
    }

    const fallback = listFromAdminSnapshot();
    cacheProducts(fallback);
    return fallback;
  },

  async listPublic(): Promise<Product[]> {
    return fetchPublicCatalog();
  },

  getById(id: number | string): Product | null {
    const cached = getCachedProduct(id);
    if (cached) {
      return cached;
    }

    const products = this.list();
    return products.find((product) => product.sku === String(id) || String(product.id) === String(id)) || null;
  },

  async getByIdentifier(identifier: string): Promise<Product | null> {
    const cached = getCachedProduct(identifier);
    if (cached) {
      return cached;
    }

    const backend = await fetchProductByIdentifier(identifier);
    if (backend) {
      return backend;
    }

    return this.getById(identifier);
  },

  async resolvePurchaseReference(
    identifier: string,
    color?: string,
    size?: string,
    options: ResolvePurchaseReferenceOptions = {},
  ) {
    const normalizedIdentifier = String(identifier || '').trim();
    const strictPublic = options.strictPublic ?? false;
    const product = strictPublic
      ? (
          UUID_PATTERN.test(normalizedIdentifier)
            ? await fetchStrictPublicProductByBackendId(normalizedIdentifier)
            : await fetchProductByIdentifier(normalizedIdentifier)
        )
      : (
          options.forceRefresh
            ? await fetchProductByIdentifier(normalizedIdentifier)
            : await this.getByIdentifier(normalizedIdentifier)
        );
    if (!product?.backendId) {
      return { backendProductId: undefined, backendVariantId: undefined, activeVariantCount: 0 };
    }

    const matchingVariant = product.variants?.find((variant) => {
      const sameColor = color ? variant.color.toLowerCase() === color.toLowerCase() : true;
      const sameSize = size ? variant.size.toLowerCase() === size.toLowerCase() : true;
      return sameColor && sameSize;
    });

    return {
      backendProductId: product.backendId,
      backendVariantId: matchingVariant?.backendId,
      activeVariantCount: product.variants?.length || 0,
    };
  },

  filter(filter: ProductFilter): Product[] {
    return filterProductsLocally(this.list(), filter);
  },

  getRelated(productId: number | string, limit = 4): Product[] {
    const products = this.list();
    return products.filter((product) => String(product.id) !== String(productId)).slice(0, limit);
  },

  getByCategory(categoryId: string): Product[] {
    return this.filter({ categoryId });
  },

  getOnSale(): Product[] {
    return this.list().filter((product) => product.originalPrice !== undefined);
  },

  getNewArrivals(): Product[] {
    return this.list().filter((product) => product.badge === 'NEW');
  },

  getCategoryName(categoryId: string): string {
    const category = PRODUCT_CATEGORIES.find((entry) => entry.id === categoryId || entry.slug === categoryId);
    return category?.name || 'Tat Ca San Pham';
  },

  search(query: string, limit?: number): Product[] {
    if (!query.trim()) return [];
    let results = this.filter({ query });
    if (limit !== undefined && limit > 0) {
      results = results.slice(0, limit);
    }
    return results;
  },

  getTotalCount(filter?: ProductFilter): number {
    return this.filter(filter || {}).length;
  },
};
