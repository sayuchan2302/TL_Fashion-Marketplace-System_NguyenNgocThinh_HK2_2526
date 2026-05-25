import { useCallback, useEffect, useState } from 'react';
import { vendorProductService, type VendorProductQuery, type VendorProductRecord } from '../../services/vendorProductService';
import { getUiErrorMessage } from '../../utils/errorMessage';
import type { ToastType } from '../../contexts/ToastContext';
import { DEFAULT_STATUS_COUNTS, PAGE_SIZE } from './vendorProducts.constants';
import type { ProductTab, VendorProductStatusCounts } from './vendorProducts.types';

interface UseVendorProductsDataOptions {
  activeTab: ProductTab;
  keyword: string;
  categoryId?: string;
  sortBy?: string;
  sortOrder?: string;
  page: number;
  updateQuery: (mutate: (query: URLSearchParams) => void, replace?: boolean) => void;
  pruneToVisibleIds: (ids: string[]) => void;
  addToast: (message: string, tone?: ToastType) => void;
}

interface LoadProductsOptions {
  silent?: boolean;
}

interface OptimisticRemovalResult {
  removedCount: number;
  pageShifted: boolean;
}

export const useVendorProductsData = ({
  activeTab,
  keyword,
  categoryId,
  sortBy,
  sortOrder,
  page,
  updateQuery,
  pruneToVisibleIds,
  addToast,
}: UseVendorProductsDataOptions) => {
  const [products, setProducts] = useState<VendorProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusCounts, setStatusCounts] = useState<VendorProductStatusCounts>(DEFAULT_STATUS_COUNTS);

  const loadProducts = useCallback(async (options?: LoadProductsOptions) => {
    if (!options?.silent) {
      setLoading(true);
      setLoadError('');
    }

    try {
      const query: VendorProductQuery = {
        status: activeTab,
        keyword: keyword || undefined,
        categoryId: categoryId || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
        page,
        size: PAGE_SIZE,
      };
      const response = await vendorProductService.getProducts(query);

      setProducts(response.items);
      setTotalElements(response.totalElements);
      setTotalPages(Math.max(response.totalPages, 1));
      setStatusCounts(response.statusCounts);
      pruneToVisibleIds(response.items
        .filter((item) => item.status !== 'banned')
        .map((item) => item.id));

      if (page > Math.max(response.totalPages, 1)) {
        updateQuery((next) => {
          next.set('page', String(Math.max(response.totalPages, 1)));
        }, true);
      }
    } catch (error: unknown) {
      const message = getUiErrorMessage(error, 'Không tải được danh sách sản phẩm của shop');
      if (!options?.silent) {
        setLoadError(message);
      }
      addToast(message, 'error');
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [activeTab, addToast, categoryId, keyword, sortBy, sortOrder, page, pruneToVisibleIds, updateQuery]);

  const removeProductsOptimistically = useCallback((ids: string[]): OptimisticRemovalResult => {
    const idSet = new Set(ids);
    const removedProducts = products.filter((product) => idSet.has(product.id));
    if (removedProducts.length === 0) {
      return { removedCount: 0, pageShifted: false };
    }

    const remainingProducts = products.filter((product) => !idSet.has(product.id));
    const nextTotalElements = Math.max(0, totalElements - removedProducts.length);
    const nextTotalPages = Math.max(1, Math.ceil(nextTotalElements / PAGE_SIZE));
    const shouldShiftPage = remainingProducts.length === 0 && page > 1 && nextTotalElements > 0;

    setProducts(remainingProducts);
    setTotalElements(nextTotalElements);
    setTotalPages(nextTotalPages);
    pruneToVisibleIds(remainingProducts.map((item) => item.id));
    setStatusCounts((current) => {
      const next = { ...current };
      for (const product of removedProducts) {
        next.all = Math.max(0, next.all - 1);
        switch (product.status) {
          case 'active':
            next.active = Math.max(0, next.active - 1);
            break;
          case 'out':
            next.outOfStock = Math.max(0, next.outOfStock - 1);
            break;
          case 'low':
            next.lowStock = Math.max(0, next.lowStock - 1);
            break;
          case 'draft':
            next.draft = Math.max(0, next.draft - 1);
            break;
          case 'banned':
            next.banned = Math.max(0, next.banned - 1);
            break;
          default:
            break;
        }
      }
      return next;
    });

    if (shouldShiftPage) {
      updateQuery((next) => {
        next.set('page', String(nextTotalPages));
      }, true);
    }

    return {
      removedCount: removedProducts.length,
      pageShifted: shouldShiftPage,
    };
  }, [page, products, pruneToVisibleIds, totalElements, updateQuery]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  return {
    products,
    loading,
    loadError,
    totalElements,
    totalPages,
    statusCounts,
    loadProducts,
    removeProductsOptimistically,
  };
};
