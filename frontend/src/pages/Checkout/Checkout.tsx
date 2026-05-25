import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Checkout.css';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../../contexts/ToastContext';
import { isValidVietnamesePhone, normalizeVietnamesePhone } from '../../utils/phone';
import { addressService } from '../../services/addressService';
import { productService } from '../../services/productService';
import { clearSelectedCartIdsForCheckout } from '../../services/checkoutSelectionStore';
import {
  clearPendingVnpayCheckout,
  setPendingVnpayCheckout,
} from '../../services/vnpayCheckoutStore';
import { orderService } from '../../services/orderService';
import { ApiError, hasBackendJwt } from '../../services/apiClient';
import type { ToastType } from '../../contexts/ToastContext';
import type { CheckoutPaymentMethod } from './checkout.types';
import { UUID_PATTERN } from './checkout.types';
import AddressBookModal from './AddressBookModal';
import { useCheckoutSelection } from './useCheckoutSelection';
import { useCheckoutCouponState } from './useCheckoutCouponState';
import { useCheckoutFormState } from './useCheckoutFormState';
import { usePendingVnpayReconcile } from './usePendingVnpayReconcile';
import CheckoutBreadcrumb from './components/CheckoutBreadcrumb';
import CheckoutShippingSection from './components/CheckoutShippingSection';
import CheckoutPaymentSection from './components/CheckoutPaymentSection';
import CheckoutStoreItemsList from './components/CheckoutStoreItemsList';
import CheckoutCouponSection from './components/CheckoutCouponSection';
import CheckoutOrderSummarySection from './components/CheckoutOrderSummarySection';
import CheckoutStickyOrderBar from './components/CheckoutStickyOrderBar';

const Checkout = () => {
  const navigate = useNavigate();
  const { items, updateQuantity, removeFromCart, clearCart, groupedByStore } = useCart();
  const { addToast: showToast } = useToast();
  const addToast = useCallback((message: string, type: ToastType) => {
    if (type === 'success' || type === 'info') {
      return;
    }
    showToast(message, type);
  }, [showToast]);

  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('cod');
  const [isLoading, setIsLoading] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  const {
    addressLocation,
    formValues,
    formErrors,
    saveAddressToBook,
    setSaveAddressToBook,
    isAddressFromBook,
    handleFieldChange,
    handleProvinceChange,
    handleDistrictChange,
    handleWardChange,
    handleAddressSelect,
    validateForm,
    resolveBackendAddress,
  } = useCheckoutFormState();

  const {
    checkoutItems,
    checkoutStoreIds,
    checkoutStoreKey,
    storeSubtotals,
    subtotal,
    shippingFee,
    isCalculatingShipping,
    clearCartByMarker,
    handleQuantityChange,
    handleRemoveItem,
  } = useCheckoutSelection({
    items,
    groupedByStore,
    updateQuantity,
    removeFromCart,
    clearCart,
    toDistrictCode: addressLocation.selectedDistrictCode,
    toWardCode: addressLocation.selectedWardCode,
  });

  const {
    couponInput,
    appliedCoupon,
    couponError,
    isCouponLoading,
    isCouponsFetching,
    availableCoupons,
    discount,
    savings,
    setCouponInputValue,
    handleApplyCoupon,
    handleRemoveCoupon,
    handleSelectCoupon,
    consumeAppliedCoupon,
  } = useCheckoutCouponState({
    checkoutStoreKey,
    checkoutStoreIds,
    storeSubtotals,
    subtotal,
    addToast,
  });

  usePendingVnpayReconcile({ clearCartByMarker });

  useEffect(() => {
    if (!hasBackendJwt()) {
      addToast('Vui lòng đăng nhập để thanh toán đơn hàng', 'error');
      navigate('/login?redirect=/checkout');
    }
  }, [addToast, navigate]);

  const total = subtotal + (shippingFee !== null ? shippingFee : 0) - discount;

  const handlePlaceOrder = useCallback(async (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (isCalculatingShipping || shippingFee === null) {
      addToast('Đang tính phí vận chuyển, vui lòng chờ trong giây lát.', 'error');
      return;
    }

    setIsLoading(true);

    try {
      if (!hasBackendJwt()) {
        throw new Error('Vui lòng đăng nhập để thanh toán.');
      }

      const normalizedPhone = normalizeVietnamesePhone(formValues.phone);
      if (!isValidVietnamesePhone(normalizedPhone)) {
        throw new Error('Số điện thoại không hợp lệ.');
      }

      const orderItems = await Promise.all(
        checkoutItems.map(async (item) => {
          const backendProductId = (item.backendProductId || '').trim();
          const backendVariantId = (item.backendVariantId || '').trim();
          const primaryIdentifier = String(item.id || '').trim();
          const candidateIdentifiers = Array.from(new Set([primaryIdentifier, backendProductId].filter(Boolean)));

          let resolvedProductId: string | undefined = (
            backendProductId && UUID_PATTERN.test(backendProductId)
          )
            ? backendProductId
            : undefined;
          let resolvedVariantId: string | undefined = (
            backendVariantId && UUID_PATTERN.test(backendVariantId)
          )
            ? backendVariantId
            : undefined;
          let activeVariantCount = 0;

          if (!resolvedVariantId) {
            for (const identifier of candidateIdentifiers) {
              const resolved = await productService.resolvePurchaseReference(
                identifier,
                item.color || undefined,
                item.size || undefined,
                { forceRefresh: true, strictPublic: true },
              );
              if (resolved.backendProductId && UUID_PATTERN.test(resolved.backendProductId)) {
                resolvedProductId = resolved.backendProductId;
                resolvedVariantId = resolved.backendVariantId;
                activeVariantCount = resolved.activeVariantCount || 0;
                break;
              }
            }
          }

          if (!resolvedProductId) {
            throw new Error(`Sản phẩm "${item.name}" chưa đồng bộ backend. Vui lòng xóa và thêm lại sản phẩm này.`);
          }

          if (!resolvedVariantId && activeVariantCount > 1) {
            throw new Error(`Sản phẩm "${item.name}" chưa chọn đúng màu/size. Vui lòng quay lại giỏ hàng và chọn lại biến thể.`);
          }

          return {
            productId: resolvedProductId,
            variantId: resolvedVariantId,
            quantity: item.quantity,
          };
        }),
      );

      const backendAddress = await resolveBackendAddress();
      const backendOrder = await orderService.createBackendOrder({
        addressId: backendAddress.id,
        paymentMethod: paymentMethod.toUpperCase(),
        customerVoucherId: appliedCoupon?.customerVoucherId,
        couponCode: appliedCoupon?.customerVoucherId ? undefined : appliedCoupon?.code,
        note: formValues.note.trim() || undefined,
        items: orderItems,
      });

      if (saveAddressToBook && formValues.name && formValues.phone && formValues.address) {
        addressService.add({
          fullName: formValues.name,
          phone: normalizedPhone,
          detail: formValues.address,
          ward: formValues.ward,
          district: formValues.district,
          province: formValues.province,
          isDefault: false,
        });
      }

      consumeAppliedCoupon();

      if (paymentMethod === 'vnpay') {
        const orderCode = String(backendOrder.code || '').trim();
        if (!orderCode) {
          throw new Error('Không tạo được mã đơn hàng để thanh toán VNPAY');
        }
        const payPayload = await orderService.createVnpayPayUrl(orderCode);
        if (!payPayload.paymentUrl) {
          throw new Error('Không tạo được URL thanh toán VNPAY');
        }

        setPendingVnpayCheckout({
          orderCode: payPayload.orderCode || orderCode,
          cartIds: checkoutItems.map((item) => item.cartId),
          createdAt: Date.now(),
        });
        window.location.href = payPayload.paymentUrl;
        return;
      }

      if (paymentMethod === 'momo') {
        const orderCode = String(backendOrder.code || '').trim();
        if (!orderCode) {
          throw new Error('Không tạo được mã đơn hàng để thanh toán MOMO');
        }
        const payPayload = await orderService.createMomoPayUrl(orderCode);
        if (!payPayload.paymentUrl) {
          throw new Error('Không tạo được URL thanh toán MOMO');
        }

        setPendingVnpayCheckout({
          orderCode: payPayload.orderCode || orderCode,
          cartIds: checkoutItems.map((item) => item.cartId),
          createdAt: Date.now(),
        });
        window.location.href = payPayload.paymentUrl;
        return;
      }

      clearCartByMarker(checkoutItems.map((item) => item.cartId));
      clearPendingVnpayCheckout();
      clearSelectedCartIdsForCheckout();
      navigate(`/order-success?id=${backendOrder.code || backendOrder.id}`);
    } catch (error) {
      const message = (error instanceof ApiError && error.status === 404)
        ? 'Một hoặc nhiều sản phẩm không còn khả dụng. Vui lòng xóa và thêm lại từ trang sản phẩm.'
        : (error instanceof Error ? error.message : 'Đặt hàng thất bại. Vui lòng thử lại.');
      addToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [
    addToast,
    appliedCoupon,
    checkoutItems,
    clearCartByMarker,
    consumeAppliedCoupon,
    formValues,
    isCalculatingShipping,
    navigate,
    paymentMethod,
    resolveBackendAddress,
    saveAddressToBook,
    shippingFee,
    validateForm,
  ]);

  const handlePlaceOrderClick = useCallback(() => {
    void handlePlaceOrder();
  }, [handlePlaceOrder]);

  return (
    <div className="checkout-page-container">
      <div className="checkout-main-content">
        <div className="checkout-container">
          <CheckoutBreadcrumb />

          <div className="checkout-layout">
            <div className="checkout-left-col">
              <CheckoutShippingSection
                formValues={formValues}
                formErrors={formErrors}
                saveAddressToBook={saveAddressToBook}
                isAddressFromBook={isAddressFromBook}
                addressLocation={addressLocation}
                onOpenAddressBook={() => setIsAddressModalOpen(true)}
                onToggleSaveAddress={setSaveAddressToBook}
                onFieldChange={handleFieldChange}
                onProvinceChange={handleProvinceChange}
                onDistrictChange={handleDistrictChange}
                onWardChange={handleWardChange}
              />

              <CheckoutPaymentSection
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
              />
            </div>

            <div className="checkout-right-col">
              <div className="checkout-summary-wrapper">
                <CheckoutStoreItemsList
                  checkoutItems={checkoutItems}
                  subtotal={subtotal}
                  onRemoveItem={handleRemoveItem}
                  onQuantityChange={handleQuantityChange}
                />

                <CheckoutCouponSection
                  couponInput={couponInput}
                  appliedCoupon={appliedCoupon}
                  couponError={couponError}
                  isCouponLoading={isCouponLoading}
                  isCouponsFetching={isCouponsFetching}
                  availableCoupons={availableCoupons}
                  onCouponInputChange={setCouponInputValue}
                  onApplyCoupon={() => void handleApplyCoupon()}
                  onRemoveCoupon={handleRemoveCoupon}
                  onSelectCoupon={handleSelectCoupon}
                />

                <CheckoutOrderSummarySection
                  appliedCoupon={appliedCoupon}
                  subtotal={subtotal}
                  shippingFee={shippingFee}
                  discount={discount}
                  total={total}
                  savings={savings}
                />
              </div>
            </div>
          </div>

          <CheckoutStickyOrderBar
            paymentMethod={paymentMethod}
            appliedCoupon={appliedCoupon}
            total={total}
            savings={savings}
            isLoading={isLoading || isCalculatingShipping}
            disabled={checkoutItems.length === 0 || shippingFee === null}
            onPlaceOrder={handlePlaceOrderClick}
          />

          <AddressBookModal
            isOpen={isAddressModalOpen}
            onClose={() => setIsAddressModalOpen(false)}
            onSelectAddress={handleAddressSelect}
          />
        </div>
      </div>
    </div>
  );
};

export default Checkout;
