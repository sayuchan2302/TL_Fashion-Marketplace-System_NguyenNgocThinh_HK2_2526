import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CartItem, StoreGroup } from '../../contexts/CartContext';
import { apiRequest } from '../../services/apiClient';
import {
  getSelectedCartIdsForCheckout,
  setSelectedCartIdsForCheckout,
} from '../../services/checkoutSelectionStore';
import {
  DEFAULT_SHIPPING_FEE,
  FREE_SHIPPING_THRESHOLD,
  UUID_PATTERN,
} from './checkout.types';

export interface CheckoutStoreGroup extends Omit<StoreGroup, 'items' | 'subtotal' | 'shippingFee'> {
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
}

interface UseCheckoutSelectionArgs {
  items: CartItem[];
  groupedByStore: () => StoreGroup[];
  updateQuantity: (cartId: string, quantity: number) => void;
  removeFromCart: (cartId: string) => void;
  clearCart: () => void;
  toDistrictCode?: string;
  toWardCode?: string;
}

export const useCheckoutSelection = ({
  items,
  groupedByStore,
  updateQuantity,
  removeFromCart,
  clearCart,
  toDistrictCode,
  toWardCode,
}: UseCheckoutSelectionArgs) => {
  const [selectedCartIds, setSelectedCartIds] = useState<string[]>(() => getSelectedCartIdsForCheckout());
  const [hasExplicitSelection] = useState<boolean>(() => getSelectedCartIdsForCheckout().length > 0);
  const [dynamicFees, setDynamicFees] = useState<Record<string, number>>({});
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);

  const checkoutItems = useMemo(() => {
    const validSelectedIds = selectedCartIds.filter((cartId) => items.some((item) => item.cartId === cartId));
    if (validSelectedIds.length === 0) {
      return hasExplicitSelection ? [] : items;
    }

    const selectedSet = new Set(validSelectedIds);
    return items.filter((item) => selectedSet.has(item.cartId));
  }, [hasExplicitSelection, items, selectedCartIds]);

  const storeGroups = useMemo(() => {
    const selectedSet = new Set(checkoutItems.map((item) => item.cartId));
    return groupedByStore()
      .map((group) => {
        const groupItems = group.items.filter((item) => selectedSet.has(item.cartId));
        if (groupItems.length === 0) {
          return null;
        }

        const subtotal = groupItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        let fee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : DEFAULT_SHIPPING_FEE;

        if (toDistrictCode && toWardCode && subtotal < FREE_SHIPPING_THRESHOLD) {
          if (group.storeId in dynamicFees) {
            fee = dynamicFees[group.storeId];
          }
        }

        return {
          ...group,
          items: groupItems,
          subtotal,
          shippingFee: fee,
        } satisfies CheckoutStoreGroup;
      })
      .filter((group): group is CheckoutStoreGroup => Boolean(group));
  }, [checkoutItems, groupedByStore, dynamicFees, toDistrictCode, toWardCode]);

  const checkoutStoreIds = useMemo(
    () => Array.from(new Set(
      storeGroups
        .map((group) => group.storeId)
        .filter((storeId) => UUID_PATTERN.test(storeId)),
    )).sort(),
    [storeGroups],
  );

  const checkoutStoreKey = useMemo(() => checkoutStoreIds.join(','), [checkoutStoreIds]);

  const storeSubtotals = useMemo(
    () => storeGroups.reduce<Record<string, number>>((acc, group) => {
      acc[group.storeId] = group.subtotal;
      return acc;
    }, {}),
    [storeGroups],
  );

  const subtotal = useMemo(
    () => checkoutItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [checkoutItems],
  );

  const shippingFee = useMemo(
    () => storeGroups.reduce((sum, group) => sum + group.shippingFee, 0),
    [storeGroups],
  );

  useEffect(() => {
    if (!toDistrictCode || !toWardCode || storeGroups.length === 0) {
      setDynamicFees({});
      return;
    }

    let isMounted = true;
    const calculateAllFees = async () => {
      setIsCalculatingShipping(true);
      const nextFees: Record<string, number> = {};

      try {
        await Promise.all(
          storeGroups.map(async (group) => {
            if (group.subtotal >= FREE_SHIPPING_THRESHOLD) {
              nextFees[group.storeId] = 0;
              return;
            }

            try {
              const weight = group.items.reduce((sum, item) => sum + item.quantity * 300, 0);
              const data = await apiRequest<{ fee: number }>('/api/shipping/ghn/calculate-fee', {
                method: 'POST',
                body: JSON.stringify({
                  storeId: group.storeId,
                  toDistrictId: Number(toDistrictCode),
                  toWardCode: toWardCode,
                  weight: weight > 0 ? weight : 500,
                  insuranceValue: group.subtotal,
                }),
              }, { auth: true });

              if (data && typeof data.fee === 'number') {
                nextFees[group.storeId] = data.fee;
              } else {
                nextFees[group.storeId] = DEFAULT_SHIPPING_FEE;
              }
            } catch (err) {
              console.error(`Failed to calculate shipping fee for store ${group.storeId}:`, err);
              nextFees[group.storeId] = DEFAULT_SHIPPING_FEE;
            }
          })
        );

        if (isMounted) {
          setDynamicFees(nextFees);
        }
      } catch (err) {
        console.error('Failed to calculate shipping fees:', err);
      } finally {
        if (isMounted) {
          setIsCalculatingShipping(false);
        }
      }
    };

    void calculateAllFees();

    return () => {
      isMounted = false;
    };
  }, [toDistrictCode, toWardCode, checkoutStoreKey]);

  const clearCartByMarker = useCallback((cartIds: string[]) => {
    const selected = Array.from(new Set(cartIds.map((value) => value.trim()).filter(Boolean)));
    if (selected.length === 0) {
      return;
    }

    const selectedSet = new Set(selected);
    const removable = items.filter((item) => selectedSet.has(item.cartId));
    if (removable.length === 0) {
      return;
    }

    if (removable.length === items.length) {
      clearCart();
    } else {
      removable.forEach((item) => removeFromCart(item.cartId));
    }

    setSelectedCartIds((prev) => {
      const next = prev.filter((id) => !selectedSet.has(id));
      setSelectedCartIdsForCheckout(next);
      return next;
    });
  }, [clearCart, items, removeFromCart]);

  const handleQuantityChange = useCallback((cartId: string, delta: number) => {
    const item = checkoutItems.find((current) => current.cartId === cartId);
    if (!item) {
      return;
    }

    const nextQuantity = item.quantity + delta;
    if (nextQuantity > 0) {
      updateQuantity(cartId, nextQuantity);
    }
  }, [checkoutItems, updateQuantity]);

  const handleRemoveItem = useCallback((cartId: string) => {
    removeFromCart(cartId);
    setSelectedCartIds((prev) => {
      const next = prev.filter((id) => id !== cartId);
      setSelectedCartIdsForCheckout(next);
      return next;
    });
  }, [removeFromCart]);

  return {
    checkoutItems,
    storeGroups,
    checkoutStoreIds,
    checkoutStoreKey,
    storeSubtotals,
    subtotal,
    shippingFee,
    clearCartByMarker,
    handleQuantityChange,
    handleRemoveItem,
    isCalculatingShipping,
  };
};
