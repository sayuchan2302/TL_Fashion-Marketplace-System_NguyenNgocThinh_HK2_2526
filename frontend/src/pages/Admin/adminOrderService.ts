import {
  fulfillmentLabel,
  type FulfillmentStatus,
  type PaymentStatus,
  type TransitionReasonCode,
} from './orderWorkflow';
import { type AdminOrderData } from './adminOrdersData';
import { ApiError, apiRequest } from '../../services/apiClient';

type TransitionSource = 'orders_list' | 'order_detail';

interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  source: TransitionSource;
  orderCode: string;
  fromFulfillment: FulfillmentStatus;
  toFulfillment: FulfillmentStatus;
  fromPayment: PaymentStatus;
  toPayment: PaymentStatus;
  reasonCode?: TransitionReasonCode;
  reasonNote?: string;
}

interface BackendAdminOrder {
  id: string;
  code?: string;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  subtotal?: number;
  shippingFee?: number;
  discount?: number;
  total?: number;
  commissionFee?: number;
  commissionRateApplied?: number;
  commissionBaseAmount?: number;
  vendorPayout?: number;
  trackingNumber?: string;
  carrier?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  deliveredAt?: string;
  storeName?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  shippingAddress?: {
    fullName?: string;
    phone?: string;
    address?: string;
    ward?: string;
    district?: string;
    city?: string;
  };
  items?: Array<{
    id: string;
    name?: string;
    productName?: string;
    variant?: string;
    quantity?: number;
    price?: number;
    image?: string;
  }>;
}

interface BackendSubOrderSummary {
  id: string;
  code?: string;
  vendorId?: string;
  vendorName?: string;
  status?: string;
  total?: number;
  trackingNumber?: string;
  itemCount?: number;
  createdAt?: string;
  customer?: {
    name?: string;
  };
}

interface BackendParentOrderSummary {
  id: string;
  code?: string;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  totalAmount?: number;
  createdAt?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  subOrders?: BackendSubOrderSummary[];
}

export interface AdminOrderRecord extends AdminOrderData {
  version: number;
  updatedAt: string;
  auditLog: AuditEntry[];
}

export interface AdminSubOrderSummary {
  id: string;
  code: string;
  vendorName: string;
  fulfillment: FulfillmentStatus;
  total: number;
  itemCount: number;
  trackingNumber: string;
  createdAt: string;
  customerName: string;
}

export interface AdminParentOrderSummary {
  id: string;
  code: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  total: number;
  paymentStatus: PaymentStatus;
  fulfillment: FulfillmentStatus;
  createdAt: string;
  subOrders: AdminSubOrderSummary[];
}

interface TransitionInput {
  code: string;
  nextFulfillment: FulfillmentStatus;
  actor: string;
  source: TransitionSource;
  reasonCode?: TransitionReasonCode;
  reasonNote?: string;
}

interface TransitionResult {
  ok: boolean;
  error?: string;
  message?: string;
  order?: AdminOrderRecord;
}

interface TrackingUpdateResult {
  ok: boolean;
  error?: string;
  message?: string;
  order?: AdminOrderRecord;
}

interface BulkTransitionResult {
  updatedCodes: string[];
  skippedCodes: string[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

const mapPaymentStatus = (status?: string, paymentMethod?: string): PaymentStatus => {
  const normalizedStatus = (status || '').toUpperCase();
  const normalizedMethod = (paymentMethod || '').toUpperCase();
  if (normalizedStatus === 'PAID') return 'paid';
  if (normalizedStatus === 'REFUND_PENDING') return 'refund_pending';
  if (normalizedStatus === 'REFUNDED') return 'refunded';
  if (normalizedMethod === 'COD') return 'cod_uncollected';
  return 'unpaid';
};

const mapFulfillmentStatus = (status?: string): FulfillmentStatus => {
  const map: Record<string, FulfillmentStatus> = {
    PENDING: 'pending',
    WAITING_FOR_VENDOR: 'pending',
    CONFIRMED: 'packing',
    PROCESSING: 'packing',
    SHIPPED: 'shipping',
    DELIVERED: 'done',
    CANCELLED: 'canceled',
  };
  return map[status || ''] || 'pending';
};

const mapBackendToAdmin = (order: BackendAdminOrder): AdminOrderRecord => {

  const customerName = order.shippingAddress?.fullName || order.customer?.name || 'Khách hàng ẩn danh';

  const toStableNumericId = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  };

  return {
    id: order.id,
    code: order.code || '',
    customer: customerName,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(customerName)}&background=0EA5E9&color=fff`,
    total: (order.total ?? 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' }),
    storeName: order.storeName,
    commissionRate: order.commissionRateApplied != null ? Number(order.commissionRateApplied) : undefined,
    commissionFee: Number(order.commissionFee || 0),
    vendorPayout: Number(order.vendorPayout || 0),
    paymentStatus: mapPaymentStatus(order.paymentStatus, order.paymentMethod),
    fulfillment: mapFulfillmentStatus(order.status),
    shipMethod: order.carrier || 'Chưa rõ',
    tracking: order.trackingNumber || '',
    date: order.createdAt || new Date().toISOString(),
    customerInfo: {
      name: customerName,
      phone: order.shippingAddress?.phone || order.customer?.phone || '',
      email: order.customer?.email || '',
    },
    address: [
      order.shippingAddress?.address,
      order.shippingAddress?.ward,
      order.shippingAddress?.district,
      order.shippingAddress?.city,
    ]
      .filter(Boolean)
      .join(', '),
    note: order.note || '',
    paymentMethod: order.paymentMethod || 'COD',
    items: (order.items || []).map((item) => ({
      id: toStableNumericId(item.id),
      name: item.name || item.productName || 'Sản phẩm',
      color: '',
      size: item.variant || '',
      qty: item.quantity || 1,
      price: item.price || 0,
      image:
        item.image ||
        'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=100&h=120&fit=crop',
    })),
    pricing: {
      subtotal: order.subtotal || 0,
      shipping: order.shippingFee || 0,
      discount: order.discount || 0,
      voucher: '',
    },
    timeline: [],
    version: 1,
    updatedAt: order.updatedAt || order.createdAt || new Date().toISOString(),
    auditLog: [],
  };
};

export const listAdminOrders = async (): Promise<AdminOrderRecord[]> => {
  const data = await apiRequest<BackendAdminOrder[]>('/api/orders/admin/all', {}, { auth: true });
  return (data || []).map(mapBackendToAdmin);
};

export const listAdminParentOrders = async (): Promise<AdminParentOrderSummary[]> => {
  const data = await apiRequest<BackendParentOrderSummary[]>('/api/admin/orders', {}, { auth: true });
  return (data || []).map((parent) => ({
    id: parent.id,
    code: parent.code || parent.id,
    customerName: parent.customer?.name || 'Khách hàng',
    customerEmail: parent.customer?.email || '',
    customerPhone: parent.customer?.phone || '',
    total: Number(parent.totalAmount || 0),
    paymentStatus: mapPaymentStatus(parent.paymentStatus, parent.paymentMethod),
    fulfillment: mapFulfillmentStatus(parent.status),
    createdAt: parent.createdAt || new Date().toISOString(),
    subOrders: (parent.subOrders || []).map((sub) => ({
      id: sub.id,
      code: sub.code || sub.id,
      vendorName: sub.vendorName || 'Unknown Store',
      fulfillment: mapFulfillmentStatus(sub.status),
      total: Number(sub.total || 0),
      itemCount: Number(sub.itemCount || 0),
      trackingNumber: sub.trackingNumber || '',
      createdAt: sub.createdAt || parent.createdAt || new Date().toISOString(),
      customerName: sub.customer?.name || parent.customer?.name || 'Khách hàng',
    })),
  }));
};

export const getAdminOrderByIdentifier = async (identifier: string): Promise<AdminOrderRecord | null> => {
  try {
    const normalized = String(identifier || '').trim();
    if (!normalized) {
      return null;
    }

    const path = UUID_PATTERN.test(normalized)
      ? `/api/orders/${encodeURIComponent(normalized)}`
      : `/api/orders/code/${encodeURIComponent(normalized)}`;

    const data = await apiRequest<BackendAdminOrder>(path, {}, { auth: true });
    return mapBackendToAdmin(data);
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

export const updateAdminOrderTracking = async (
  code: string,
  trackingNumber: string,
): Promise<TrackingUpdateResult> => {
  try {
    const data = await apiRequest<BackendAdminOrder>(
      `/api/orders/admin/${code}/tracking`,
      {
        method: 'PATCH',
        body: JSON.stringify({ trackingNumber }),
      },
      { auth: true },
    );

    return {
      ok: true,
      order: mapBackendToAdmin(data),
      message: 'Đã cập nhật mã vận đơn.',
    };
  } catch (error: unknown) {
    console.error('Failed to update tracking number', error);
    return { ok: false, error: toErrorMessage(error, 'Không thể cập nhật mã vận đơn.') };
  }
};

export const subscribeAdminOrders = (listener: () => void) => {
  const interval = setInterval(listener, 15000);
  return () => clearInterval(interval);
};

export const transitionAdminOrder = async (input: TransitionInput): Promise<TransitionResult> => {
  try {
    const statusMap: Record<FulfillmentStatus, string> = {
      pending: 'PENDING',
      packing: 'PROCESSING',
      shipping: 'SHIPPED',
      done: 'DELIVERED',
      canceled: 'CANCELLED',
    };

    const requestPayload = {
      status: statusMap[input.nextFulfillment],
      reason: input.reasonNote || 'Admin cập nhật',
    };

    const data = await apiRequest<BackendAdminOrder>(
      `/api/orders/admin/${input.code}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(requestPayload),
      },
      { auth: true },
    );

    return {
      ok: true,
      order: mapBackendToAdmin(data),
      message: `Đã chuyển sang ${fulfillmentLabel(input.nextFulfillment)}.`,
    };
  } catch (error: unknown) {
    console.error('Failed to transition order', error);
    return { ok: false, error: toErrorMessage(error, 'Không thể cập nhật trạng thái đơn hàng.') };
  }
};

export const bulkTransitionToPacking = async (
  codes: string[],
  actor: string,
): Promise<BulkTransitionResult> => {
  const updatedCodes: string[] = [];
  const skippedCodes: string[] = [];

  for (const code of codes) {
    const result = await transitionAdminOrder({
      code,
      nextFulfillment: 'packing',
      actor,
      source: 'orders_list',
    });
    if (result.ok) {
      updatedCodes.push(code);
    } else {
      skippedCodes.push(code);
    }
  }

  return { updatedCodes, skippedCodes };
};
