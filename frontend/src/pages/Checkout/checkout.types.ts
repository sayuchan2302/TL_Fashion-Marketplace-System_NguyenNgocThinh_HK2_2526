import type { Coupon } from '../../services/couponService';

export interface BackendAddressPayload {
  id: string;
  fullName?: string;
  phone?: string;
  detail?: string;
  ward?: string;
  district?: string;
  province?: string;
  isDefault?: boolean;
  ghnProvinceId?: number | null;
  ghnDistrictId?: number | null;
  ghnWardCode?: string | null;
}

export interface FormErrors {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  ward?: string;
  note?: string;
}

export interface CheckoutFormValues {
  name: string;
  phone: string;
  email: string;
  address: string;
  province: string;
  district: string;
  ward: string;
  note: string;
}

export interface CheckoutCoupon extends Coupon {
  customerVoucherId?: string;
}

export type CheckoutPaymentMethod = 'cod' | 'momo' | 'vnpay';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DEFAULT_SHIPPING_FEE = 30000;
export const PENDING_VNPAY_RECONCILE_TTL_MS = 2 * 60 * 60 * 1000;

export const normalizeCouponCode = (value: string) => value.trim().replace(/\s+/g, '').toUpperCase();

export const DEFAULT_CHECKOUT_FORM_VALUES: CheckoutFormValues = {
  name: '',
  phone: '',
  email: '',
  address: '',
  province: '',
  district: '',
  ward: '',
  note: '',
};
