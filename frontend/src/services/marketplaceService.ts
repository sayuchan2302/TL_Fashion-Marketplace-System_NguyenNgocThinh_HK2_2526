import { apiRequest } from './apiClient';
import type { Product } from '../types';
import { getOptimizedImageUrl } from '../utils/getOptimizedImageUrl';
import { resolveColorSwatch } from '../utils/colorSwatch';

export interface MarketplaceStoreCard {
  id: string;
  storeCode: string;
  name: string;
  slug: string;
  logo?: string;
  rating: number;
  totalOrders: number;
  liveProductCount: number;
}

export interface MarketplaceHomeCategoryItem {
  id: string;
  name: string;
  slug: string;
  image: string;
}

export interface MarketplaceHomeCategoryTab {
  id: 'nam' | 'nu' | 'phu-kien';
  label: string;
  slug: string;
  items: MarketplaceHomeCategoryItem[];
}

export interface MarketplaceHeaderCategoryLeaf {
  id: string;
  name: string;
  slug: string;
}

export interface MarketplaceHeaderCategoryGroup {
  id: string;
  name: string;
  slug: string;
  children: MarketplaceHeaderCategoryLeaf[];
}

export interface MarketplaceHeaderCategoryRoot {
  id: 'nam' | 'nu' | 'phu-kien';
  label: string;
  slug: string;
  children: MarketplaceHeaderCategoryGroup[];
}

export interface MarketplaceHomeData {
  featuredStores: MarketplaceStoreCard[];
  featuredProducts: Product[];
  trendingProducts: Product[];
  categoryTabs: MarketplaceHomeCategoryTab[];
}

export interface MarketplaceFlashSaleData {
  campaignId?: string;
  campaignName?: string;
  startAt?: string;
  endAt?: string;
  serverTime?: string;
  items: MarketplaceFlashSaleItem[];
}

export interface MarketplaceImageSearchData {
  items: Product[];
  totalCandidates: number;
  mode?: string;
  indexVersion?: string;
  inferredCategory?: string;
  inferredCategoryScore?: number;
  categoryFilterApplied?: string;
  returnedCandidates?: number;
  groupedCandidates?: number;
  thresholdFilteredCandidates?: number;
  topScore?: number;
  scoreFloor?: number;
  matches?: MarketplaceImageSearchMatch[];
}

export interface MarketplaceImageSearchMatch {
  productId: string;
  rank: number;
  score: number;
  matchedImageUrl?: string;
  matchedImageIndex?: number;
  isPrimary?: boolean;
}

export interface MarketplaceFlashSaleItem {
  id: string;
  backendProductId?: string;
  backendVariantId?: string;
  name: string;
  image: string;
  price: number;
  originalPrice?: number;
  badge?: string;
  colors?: string[];
  sizes?: string[];
  variants?: Array<{
    color: string;
    colorHex?: string;
    size: string;
    backendId?: string;
  }>;
  storeName: string;
  storeId?: string;
  storeSlug?: string;
  isOfficialStore?: boolean;
  soldCount: number;
  totalStock: number;
}

interface MarketplaceProductCardPayload {
  id: string;
  slug?: string;
  productCode: string;
  name: string;
  category?: string;
  categorySlug?: string;
  image?: string;
  price?: number;
  priceAmount?: string;
  originalPrice?: number;
  originalPriceAmount?: string;
  badge?: string;
  material?: string;
  fit?: string;
  gender?: string;
  colors?: string[];
  stock?: number;
  storeId?: string;
  storeName?: string;
  storeSlug?: string;
  storeLogo?: string;
  officialStore?: boolean;
  sizes?: string[];
  variants?: Array<{
    id?: string;
    sku?: string;
    color?: string;
    colorHex?: string;
    size?: string;
    stockQuantity?: number;
  }>;
}

interface MarketplaceStoreCardPayload {
  id: string;
  storeCode?: string;
  name: string;
  slug: string;
  logo?: string;
  rating?: number;
  totalOrders?: number;
  liveProductCount?: number;
}

interface MarketplaceHomePayload {
  featuredStores?: MarketplaceStoreCardPayload[];
  featuredProducts?: MarketplaceProductCardPayload[];
  trendingProducts?: MarketplaceProductCardPayload[];
}

interface MarketplaceFlashSaleItemPayload {
  flashSaleItemId?: string;
  productId?: string;
  productSlug?: string;
  productCode?: string;
  variantId?: string;
  name?: string;
  image?: string;
  flashPrice?: number;
  flashPriceAmount?: string;
  originalPrice?: number;
  originalPriceAmount?: string;
  soldCount?: number;
  quota?: number;
  storeId?: string;
  storeName?: string;
  storeSlug?: string;
  officialStore?: boolean;
  colors?: string[];
  sizes?: string[];
  variants?: Array<{
    id?: string;
    sku?: string;
    color?: string;
    colorHex?: string;
    size?: string;
    stockQuantity?: number;
  }>;
}

interface MarketplaceFlashSalePayload {
  campaignId?: string;
  campaignName?: string;
  startAt?: string;
  endAt?: string;
  serverTime?: string;
  items?: MarketplaceFlashSaleItemPayload[];
}

interface MarketplaceImageSearchPayload {
  items?: MarketplaceProductCardPayload[];
  totalCandidates?: number;
  mode?: string;
  indexVersion?: string;
  inferredCategory?: string;
  inferredCategoryScore?: number;
  categoryFilterApplied?: string;
  returnedCandidates?: number;
  groupedCandidates?: number;
  thresholdFilteredCandidates?: number;
  topScore?: number;
  scoreFloor?: number;
  matches?: Array<{
    productId?: string;
    rank?: number;
    score?: number;
    matchedImageUrl?: string;
    matchedImageIndex?: number;
    isPrimary?: boolean;
  }>;
}

interface BackendCategoryTreeNode {
  id: string;
  name: string;
  slug?: string;
  image?: string;
  children?: BackendCategoryTreeNode[];
}

interface BackendPage<T> {
  content?: T[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
}

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const optimizeMarketplaceImage = (rawUrl: string | null | undefined, width: number) =>
  getOptimizedImageUrl(rawUrl, { width, format: 'webp', quality: 74 });

const normalizeColorKey = (value: string) => String(value || '').trim().toLowerCase();

const dedupeColorsBySwatch = (
  colors: string[] | undefined,
  variants: MarketplaceProductCardPayload['variants'],
): string[] => {
  const variantRows = variants || [];
  const colorHexByName = new Map<string, string>();
  for (const variant of variantRows) {
    const colorName = normalizeColorKey(variant.color || '');
    const colorHex = String(variant.colorHex || '').trim().toLowerCase();
    if (!colorName || !colorHex || colorHexByName.has(colorName)) {
      continue;
    }
    colorHexByName.set(colorName, colorHex);
  }

  const sourceColors = (colors && colors.length > 0)
    ? colors
    : variantRows.map((variant) => variant.color || '');

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

const mapProductCard = (row: MarketplaceProductCardPayload): Product => {
  const price = toNumber(row.priceAmount ?? row.price, 0);
  const originalPrice = toNumber(row.originalPriceAmount ?? row.originalPrice, 0);
  const resolvedOriginalPrice = originalPrice > price ? originalPrice : undefined;
  const routeKey = (row.slug || row.productCode || row.id || '').trim();
  const normalizedRouteKey = routeKey || row.id;
  const variants = (row.variants || [])
    .filter((variant) => Boolean((variant.size || '').trim()))
    .map((variant, index) => ({
      id: (variant.sku || variant.id || `${normalizedRouteKey}-v${index + 1}`).trim(),
      backendId: (variant.id || '').trim() || undefined,
      size: (variant.size || '').trim(),
      color: (variant.color || '').trim(),
      colorHex: (variant.colorHex || '').trim() || undefined,
      sku: (variant.sku || '').trim(),
      price,
      stock: Math.max(0, Number(variant.stockQuantity || 0)),
    }));
  const sizes = row.sizes && row.sizes.length > 0
    ? Array.from(new Set(row.sizes.map((size) => String(size || '').trim()).filter(Boolean)))
    : Array.from(new Set(variants.map((variant) => variant.size).filter(Boolean)));

  return {
    id: normalizedRouteKey,
    sku: row.productCode || row.id,
    name: row.name || 'Sản phẩm',
    category: row.category || 'Marketplace',
    categorySlug: row.categorySlug,
    material: row.material,
    fit: row.fit,
    gender: row.gender,
    price,
    originalPrice: resolvedOriginalPrice,
    image:
      optimizeMarketplaceImage(row.image, 720)
      || optimizeMarketplaceImage('https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=672&h=990&fit=crop', 720),
    badge: row.badge,
    colors: dedupeColorsBySwatch(row.colors, row.variants),
    sizes: sizes.length > 0 ? sizes : undefined,
    stock: Number.isFinite(row.stock) ? Number(row.stock) : 0,
    status: 'ACTIVE',
    statusType: Number(row.stock || 0) <= 0 ? 'out' : Number(row.stock || 0) < 10 ? 'low' : 'active',
    variants: variants.length > 0 ? variants : undefined,
    storeId: row.storeId,
    storeName: row.storeName,
    storeSlug: row.storeSlug,
    storeLogo: row.storeLogo,
    isOfficialStore: Boolean(row.officialStore),
    backendId: row.id,
  };
};

const mapStoreCard = (row: MarketplaceStoreCardPayload): MarketplaceStoreCard => ({
  id: row.id,
  storeCode: (row.slug || row.storeCode || '').trim(),
  name: row.name,
  slug: row.slug,
  logo: row.logo,
  rating: toNumber(row.rating, 0),
  totalOrders: Math.max(0, Math.round(toNumber(row.totalOrders, 0))),
  liveProductCount: Math.max(0, Math.round(toNumber(row.liveProductCount, 0))),
});

const mapFlashSaleItem = (row: MarketplaceFlashSaleItemPayload): MarketplaceFlashSaleItem | null => {
  const routeKey = (row.productSlug || row.productCode || row.productId || '').trim();
  if (!routeKey) {
    return null;
  }

  const flashPrice = toNumber(row.flashPriceAmount ?? row.flashPrice, 0);
  if (!Number.isFinite(flashPrice) || flashPrice <= 0) {
    return null;
  }
  const originalPrice = toNumber(row.originalPriceAmount ?? row.originalPrice, 0);
  const quota = Math.max(1, Math.round(toNumber(row.quota, 1)));
  const soldCount = Math.min(quota, Math.max(0, Math.round(toNumber(row.soldCount, 0))));

  const variants = (row.variants || [])
    .filter((variant) => Boolean((variant.size || '').trim()))
    .map((variant, index) => ({
      color: String(variant.color || '').trim(),
      colorHex: String(variant.colorHex || '').trim() || undefined,
      size: String(variant.size || '').trim(),
      backendId: String(variant.id || '').trim() || String(variant.sku || '').trim() || `${routeKey}-v${index + 1}`,
    }));

  const sizes = row.sizes && row.sizes.length > 0
    ? Array.from(new Set(row.sizes.map((size) => String(size || '').trim()).filter(Boolean)))
    : Array.from(new Set(variants.map((variant) => variant.size).filter(Boolean)));

  return {
    id: routeKey,
    backendProductId: (row.productId || '').trim() || undefined,
    backendVariantId: (row.variantId || '').trim() || undefined,
    name: row.name || 'Sản phẩm',
    image:
      optimizeMarketplaceImage(row.image, 720)
      || optimizeMarketplaceImage('https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=672&h=990&fit=crop', 720),
    price: flashPrice,
    originalPrice: originalPrice > flashPrice ? originalPrice : undefined,
    badge: 'FLASH SALE',
    colors: dedupeColorsBySwatch(row.colors, row.variants),
    sizes: sizes.length > 0 ? sizes : undefined,
    variants: variants.length > 0 ? variants : undefined,
    storeName: (row.storeName || '').trim() || 'Nhà bán',
    storeId: (row.storeId || '').trim() || undefined,
    storeSlug: (row.storeSlug || '').trim() || undefined,
    isOfficialStore: Boolean(row.officialStore),
    soldCount,
    totalStock: quota,
  };
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const resolveMarketplaceRoot = (
  trees: BackendCategoryTreeNode[],
  expectedSlug: string,
  expectedName: string,
): BackendCategoryTreeNode | undefined => {
  return trees.find((node) => {
    const slug = (node.slug || '').toLowerCase();
    const name = normalizeText(node.name || '');
    return slug === expectedSlug || name === expectedName;
  });
};

const mapHeaderRoot = (
  root: BackendCategoryTreeNode,
  id: 'nam' | 'nu' | 'phu-kien',
  label: string,
): MarketplaceHeaderCategoryRoot => ({
  id,
  label,
  slug: root.slug || id,
  children: (root.children || []).map((group) => ({
    id: group.id,
    name: group.name || 'Danh mục',
    slug: (group.slug || root.slug || id).trim(),
    children: (group.children || []).map((leaf) => ({
      id: leaf.id,
      name: leaf.name || 'Danh mục',
      slug: (leaf.slug || group.slug || root.slug || id).trim(),
    })),
  })),
});

const mapHeaderCategoryTree = (trees: BackendCategoryTreeNode[]): MarketplaceHeaderCategoryRoot[] => {
  if (!Array.isArray(trees) || trees.length === 0) {
    return [];
  }

  const menRoot = resolveMarketplaceRoot(trees, 'men', 'nam');
  const womenRoot = resolveMarketplaceRoot(trees, 'women', 'nu');
  const accessoryRoot = resolveMarketplaceRoot(trees, 'accessories', 'phu kien');

  const roots: MarketplaceHeaderCategoryRoot[] = [];
  if (menRoot) {
    roots.push(mapHeaderRoot(menRoot, 'nam', 'NAM'));
  }
  if (womenRoot) {
    roots.push(mapHeaderRoot(womenRoot, 'nu', 'NỮ'));
  }
  if (accessoryRoot) {
    roots.push(mapHeaderRoot(accessoryRoot, 'phu-kien', 'PHỤ KIỆN'));
  }

  return roots;
};

const mapHomeCategoryTab = (
  root: BackendCategoryTreeNode,
  tabId: 'nam' | 'nu' | 'phu-kien',
  label: string,
): MarketplaceHomeCategoryTab => {
  const children = root.children || [];
  const items = children.map((item) => {
    const slug = (item.slug || '').trim();
    const image =
      optimizeMarketplaceImage(item.image, 400) ||
      optimizeMarketplaceImage(root.image, 400) ||
      '';

    return {
      id: item.id,
      name: item.name || 'Danh mục',
      slug: slug || root.slug || tabId,
      image,
    };
  });

  return {
    id: tabId,
    label,
    slug: root.slug || tabId,
    items,
  };
};

const fetchHomeCategoryTabs = async (): Promise<MarketplaceHomeCategoryTab[]> => {
  const trees = await apiRequest<BackendCategoryTreeNode[]>('/api/categories/tree');
  if (!Array.isArray(trees) || trees.length === 0) {
    return [];
  }

  const menRoot = resolveMarketplaceRoot(trees, 'men', 'nam');
  const womenRoot = resolveMarketplaceRoot(trees, 'women', 'nu');
  const accessoryRoot = resolveMarketplaceRoot(trees, 'accessories', 'phu kien');

  const tabs: MarketplaceHomeCategoryTab[] = [];
  if (menRoot && (menRoot.children || []).length > 0) {
    tabs.push(mapHomeCategoryTab(menRoot, 'nam', 'NAM'));
  }
  if (womenRoot && (womenRoot.children || []).length > 0) {
    tabs.push(mapHomeCategoryTab(womenRoot, 'nu', 'NỮ'));
  }
  if (accessoryRoot && (accessoryRoot.children || []).length > 0) {
    tabs.push(mapHomeCategoryTab(accessoryRoot, 'phu-kien', 'PHỤ KIỆN'));
  }
  return tabs;
};

const fetchHeaderCategoryTree = async (): Promise<MarketplaceHeaderCategoryRoot[]> => {
  const trees = await apiRequest<BackendCategoryTreeNode[]>('/api/categories/tree');
  return mapHeaderCategoryTree(trees);
};

export const marketplaceService = {
  async getHomeData(): Promise<MarketplaceHomeData> {
    const [payload, categoryTabs] = await Promise.all([
      apiRequest<MarketplaceHomePayload>('/api/public/marketplace/home'),
      fetchHomeCategoryTabs().catch(() => [] as MarketplaceHomeCategoryTab[]),
    ]);

    return {
      featuredStores: (payload.featuredStores || []).map(mapStoreCard),
      featuredProducts: (payload.featuredProducts || []).map(mapProductCard),
      trendingProducts: (payload.trendingProducts || []).map(mapProductCard),
      categoryTabs,
    };
  },

  async getHeaderCategoryTree(): Promise<MarketplaceHeaderCategoryRoot[]> {
    try {
      return await fetchHeaderCategoryTree();
    } catch {
      return [];
    }
  },

  async getActiveFlashSale(): Promise<MarketplaceFlashSaleData> {
    const payload = await apiRequest<MarketplaceFlashSalePayload>('/api/public/marketplace/flash-sale/active');
    const items = (payload.items || [])
      .map(mapFlashSaleItem)
      .filter((row): row is MarketplaceFlashSaleItem => Boolean(row));

    return {
      campaignId: (payload.campaignId || '').trim() || undefined,
      campaignName: (payload.campaignName || '').trim() || undefined,
      startAt: (payload.startAt || '').trim() || undefined,
      endAt: (payload.endAt || '').trim() || undefined,
      serverTime: (payload.serverTime || '').trim() || undefined,
      items,
    };
  },

  async searchProducts(query: string, page = 0, size = 20, categorySlug?: string) {
    const params = new URLSearchParams();
    params.set('q', query);
    params.set('page', String(Math.max(page, 0)));
    params.set('size', String(Math.max(size, 1)));
    const normalizedCategory = (categorySlug || '').trim();
    if (normalizedCategory) {
      params.set('category', normalizedCategory);
    }

    const payload = await apiRequest<BackendPage<MarketplaceProductCardPayload>>(
      `/api/public/marketplace/search/products?${params.toString()}`,
    );

    const rows = (payload.content || []).map(mapProductCard);
    return {
      items: rows,
      total: Number(payload.totalElements || rows.length),
      page: Number(payload.number || 0),
      size: Number(payload.size || size),
      totalPages: Number(payload.totalPages || 1),
    };
  },

  async searchStores(query: string, page = 0, size = 20) {
    const params = new URLSearchParams();
    params.set('q', query);
    params.set('page', String(Math.max(page, 0)));
    params.set('size', String(Math.max(size, 1)));

    const payload = await apiRequest<BackendPage<MarketplaceStoreCardPayload>>(
      `/api/public/marketplace/search/stores?${params.toString()}`,
    );

    const rows = (payload.content || []).map(mapStoreCard);
    return {
      items: rows,
      total: Number(payload.totalElements || rows.length),
      page: Number(payload.number || 0),
      size: Number(payload.size || size),
      totalPages: Number(payload.totalPages || 1),
    };
  },

  async searchProductsByImage(
    file: File,
    limit = 120,
    options?: { categorySlug?: string; storeSlug?: string },
  ): Promise<MarketplaceImageSearchData> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('limit', String(Math.max(1, limit)));
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, limit)));
    const categorySlug = (options?.categorySlug || '').trim();
    const storeSlug = (options?.storeSlug || '').trim();
    if (categorySlug) {
      params.set('category', categorySlug);
    }
    if (storeSlug) {
      params.set('store', storeSlug);
    }

    const payload = await apiRequest<MarketplaceImageSearchPayload>(
      `/api/public/marketplace/search/image?${params.toString()}`,
      {
        method: 'POST',
        body: formData,
      },
    );

    const matches: MarketplaceImageSearchMatch[] = [];
    for (const match of payload.matches || []) {
      const productId = String(match.productId || '').trim();
      if (!productId) {
        continue;
      }
      matches.push({
        productId,
        rank: Math.max(1, Math.round(toNumber(match.rank, 1))),
        score: toNumber(match.score, 0),
        matchedImageUrl: String(match.matchedImageUrl || '').trim() || undefined,
        matchedImageIndex: Number.isFinite(match.matchedImageIndex)
          ? Number(match.matchedImageIndex)
          : undefined,
        isPrimary: typeof match.isPrimary === 'boolean' ? match.isPrimary : undefined,
      });
    }

    const items = (payload.items || []).map(mapProductCard);
    const totalCandidates = Number.isFinite(payload.totalCandidates)
      ? Math.max(0, Number(payload.totalCandidates))
      : items.length;

    return {
      items,
      totalCandidates,
      mode: (payload.mode || '').trim() || undefined,
      indexVersion: (payload.indexVersion || '').trim() || undefined,
      inferredCategory: (payload.inferredCategory || '').trim() || undefined,
      inferredCategoryScore: Number.isFinite(payload.inferredCategoryScore)
        ? Number(payload.inferredCategoryScore)
        : undefined,
      categoryFilterApplied: (payload.categoryFilterApplied || '').trim() || undefined,
      returnedCandidates: Number.isFinite(payload.returnedCandidates)
        ? Math.max(0, Number(payload.returnedCandidates))
        : undefined,
      groupedCandidates: Number.isFinite(payload.groupedCandidates)
        ? Math.max(0, Number(payload.groupedCandidates))
        : undefined,
      thresholdFilteredCandidates: Number.isFinite(payload.thresholdFilteredCandidates)
        ? Math.max(0, Number(payload.thresholdFilteredCandidates))
        : undefined,
      topScore: Number.isFinite(payload.topScore) ? Number(payload.topScore) : undefined,
      scoreFloor: Number.isFinite(payload.scoreFloor) ? Number(payload.scoreFloor) : undefined,
      matches,
    };
  },
};
