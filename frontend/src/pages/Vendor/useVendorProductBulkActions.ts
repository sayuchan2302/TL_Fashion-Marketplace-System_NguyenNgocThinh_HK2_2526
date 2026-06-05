import { useCallback, useState } from 'react';
import { vendorProductService, type VendorProductRecord } from '../../services/vendorProductService';
import { getUiErrorMessage } from '../../utils/errorMessage';
import type { ToastType } from '../../contexts/ToastContext';
import type { DeleteConfirmState, VisibilityConfirmState } from './vendorProducts.types';

interface UseVendorProductBulkActionsOptions {
  products: VendorProductRecord[];
  clearSelection: () => void;
  loadProducts: (options?: { silent?: boolean }) => Promise<void>;
  removeProductsOptimistically: (ids: string[]) => { removedCount: number; pageShifted: boolean };
  addToast: (message: string, tone?: ToastType) => void;
  pushToast: (message: string) => void;
}

export const useVendorProductBulkActions = ({
  products,
  clearSelection,
  loadProducts,
  removeProductsOptimistically,
  addToast,
  pushToast,
}: UseVendorProductBulkActionsOptions) => {
  const [working, setWorking] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [visibilityConfirm, setVisibilityConfirm] = useState<VisibilityConfirmState | null>(null);

  const applyVisibility = useCallback(async (ids: string[], visible: boolean) => {
    const allowedIds = ids.filter((id) => products.some((product) => product.id === id && product.canToggleVisibility && product.status !== 'banned'));
    if (allowedIds.length === 0) {
      addToast('Sản phẩm bị chặn chỉ có thể xem, không thể đổi trạng thái hiển thị.', 'info');
      return;
    }

    if (!visible) {
      const items = products.filter((product) => allowedIds.includes(product.id));
      setVisibilityConfirm({
        ids: allowedIds,
        visible,
        selectedItems: items.map((item) => item.name),
        title: allowedIds.length > 1 ? 'Ẩn các sản phẩm đã chọn' : 'Ẩn sản phẩm',
        description: allowedIds.length > 1
          ? 'Các sản phẩm này sẽ bị ẩn khỏi cửa hàng và không thể tìm thấy bởi người mua.'
          : 'Sản phẩm này sẽ bị ẩn khỏi cửa hàng và không thể tìm thấy bởi người mua.',
        confirmLabel: allowedIds.length > 1 ? 'Ẩn sản phẩm' : 'Ẩn ngay',
      });
      return;
    }

    setWorking(true);
    try {
      await Promise.all(allowedIds.map((id) => vendorProductService.setVisibility(id, visible)));
      clearSelection();
      pushToast('Đã mở hiển thị các sản phẩm đã chọn');
      await loadProducts();
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể cập nhật trạng thái hiển thị'), 'error');
    } finally {
      setWorking(false);
    }
  }, [addToast, clearSelection, loadProducts, products, pushToast]);

  const confirmVisibility = useCallback(async () => {
    if (!visibilityConfirm) {
      return;
    }

    setWorking(true);
    try {
      await Promise.all(visibilityConfirm.ids.map((id) => vendorProductService.setVisibility(id, visibilityConfirm.visible)));
      clearSelection();
      pushToast(visibilityConfirm.visible ? 'Đã mở hiển thị các sản phẩm đã chọn' : 'Đã ẩn các sản phẩm đã chọn');
      setVisibilityConfirm(null);
      await loadProducts();
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể cập nhật trạng thái hiển thị'), 'error');
    } finally {
      setWorking(false);
    }
  }, [addToast, clearSelection, loadProducts, pushToast, visibilityConfirm]);

  const requestDelete = useCallback((ids: string[]) => {
    const items = products.filter((product) => ids.includes(product.id) && product.status !== 'banned');
    if (items.length === 0) {
      addToast('Sản phẩm bị chặn chỉ có thể xem, không thể xóa từ kênh người bán.', 'info');
      return;
    }

    setDeleteConfirm({
      ids,
      selectedItems: items.map((item) => item.name),
      title: ids.length > 1 ? 'Xóa các sản phẩm đã chọn' : 'Xóa sản phẩm',
      description:
        ids.length > 1
          ? 'Sản phẩm sẽ được đưa về trạng thái lưu trữ (soft delete) và ẩn khỏi storefront.'
          : 'Sản phẩm sẽ được đưa về trạng thái lưu trữ (soft delete).',
      confirmLabel: ids.length > 1 ? 'Xóa sản phẩm' : 'Xóa ngay',
    });
  }, [addToast, products]);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) {
      return;
    }

    setWorking(true);
    try {
      await Promise.all(deleteConfirm.ids.map((id) => vendorProductService.deleteProduct(id)));
      clearSelection();
      const { removedCount, pageShifted } = removeProductsOptimistically(deleteConfirm.ids);
      pushToast(deleteConfirm.ids.length > 1 ? 'Đã xóa các sản phẩm đã chọn' : 'Đã xóa sản phẩm');
      setDeleteConfirm(null);

      if (removedCount > 0 && !pageShifted) {
        void loadProducts({ silent: true });
      }
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể xóa sản phẩm'), 'error');
    } finally {
      setWorking(false);
    }
  }, [addToast, clearSelection, deleteConfirm, loadProducts, pushToast, removeProductsOptimistically]);

  return {
    working,
    deleteConfirm,
    setDeleteConfirm,
    visibilityConfirm,
    setVisibilityConfirm,
    applyVisibility,
    confirmVisibility,
    requestDelete,
    confirmDelete,
  };
};
