import type {
  VendorProductCategory,
  VendorProductRecord,
  VendorProductStatus,
  VendorProductVariant,
} from '../../services/vendorProductService';

export type ProductTab = 'all' | 'active' | 'outOfStock' | 'draft' | 'banned';

export interface DeleteConfirmState {
  ids: string[];
  selectedItems: string[];
  title: string;
  description: string;
  confirmLabel: string;
}

export interface VisibilityConfirmState {
  ids: string[];
  visible: boolean;
  selectedItems: string[];
  title: string;
  description: string;
  confirmLabel: string;
}

export interface ProductFormState {
  id?: string;
  slug?: string;
  parentCategoryId: string;
  name: string;
  categoryId: string;
  basePrice: number;
  salePrice: number;
  stock: number;
  images: string[];
  description: string;
  sizeAndFit: string;
  fabricAndCare: string;
  gender: string;
  fit: string;
  visible: boolean;
  status?: VendorProductStatus;
  approvalStatus?: string;
  moderationReason?: string;
}

export interface VariantRowFormState {
  key: string;
  axis1: string;
  axis2: string;
  colorHex: string;
  stockQuantity: number;
  priceAdjustment: number;
  isActive: boolean;
}

export type ProductFormErrors = {
  name?: string;
  categoryId?: string;
  image?: string;
  variants?: string;
};

export interface VendorProductStatusCounts {
  all: number;
  active: number;
  draft: number;
  outOfStock: number;
  lowStock: number;
  banned: number;
}

export interface VendorProductsDataState {
  products: VendorProductRecord[];
  totalElements: number;
  totalPages: number;
  statusCounts: VendorProductStatusCounts;
  loading: boolean;
  loadError: string;
}

export interface VendorProductEditorCategoryState {
  categories: VendorProductCategory[];
  leafCategories: VendorProductCategory[];
  parentCategories: VendorProductCategory[];
  childCategories: VendorProductCategory[];
}

export type ProductStatusTone = 'success' | 'pending' | 'error' | 'neutral';

export interface VendorProductStatusOption {
  status: VendorProductStatus;
  label: string;
  tone: ProductStatusTone;
}

export interface VendorProductVariantSaveShape {
  color: string;
  colorHex: string;
  size: string;
  stockQuantity: number;
  priceAdjustment: number;
  isActive: boolean;
}

export interface VendorProductEditSeed {
  product: VendorProductRecord;
  variants: VendorProductVariant[];
}
