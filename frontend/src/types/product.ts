export interface ProductVariant {
  id: string;
  size: string;
  color: string;
  colorHex?: string;
  sku: string;
  price: number;
  stock: number;
  backendId?: string;
}

export type ProductStatusType = 'active' | 'low' | 'out';

export interface Product {
  id: number | string;
  sku: string;
  name: string;
  description?: string;
  sizeAndFit?: string;
  fabricAndCare?: string;
  highlights?: string;
  material?: string;
  fit?: string;
  gender?: string;
  careInstructions?: string;
  category?: string;
  categorySlug?: string;
  price: number;
  originalPrice?: number;
  image: string;
  images?: string[];
  badge?: string;
  colors?: string[];
  sizes?: string[];
  stock: number;
  sold?: number;
  status: string;
  statusType: ProductStatusType;
  variants?: ProductVariant[];
  backendId?: string;
  // Store/Vendor info
  storeId?: string;
  storeName?: string;
  storeSlug?: string;
  storeLogo?: string;
  isOfficialStore?: boolean;
}
