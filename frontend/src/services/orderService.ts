/**
 * orderService.ts — Client-facing order operations.
 * Now reads/writes through sharedOrderStore (unified with AdminOrders).
 * 
 * Multi-vendor: Supports sub-order splitting by store.
 */
import { sharedOrderStore, fulfillmentToClientStatus, clientStatusToFulfillment, type SharedOrder, type ClientOrderStatus } from './sharedOrderStore';
import { ApiError, apiRequest } from './apiClient';
import type { Order, OrderStatus, OrderItem, OrderStatusStep } from '../types';



interface BackendOrderRequestItem {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice?: number;
}

interface BackendAddressSummary {
  fullName?: string;
  phone?: string;
  address?: string;
  detail?: string;
  ward?: string;
  district?: string;
  city?: string;
  province?: string;
}

interface BackendOrderItemResponse {
  id?: string;
  productId?: string;
  productSlug?: string;
  name?: string;
  sku?: string;
  image?: string;
  productName?: string;
  variantName?: string;
  productImage?: string;
  variant?: string;
  quantity?: number;
  price?: number;
  unitPrice?: number;
  totalPrice?: number;
}

interface BackendOrderResponse {
  id: string;
  code?: string;
  createdAt?: string;
  deliveredAt?: string;
  escrowDeadlineAt?: string;
  status?: string;
  vendorConfirmationDeadlineAt?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  subtotal?: number;
  shippingFee?: number;
  discount?: number;
  total?: number;
  carrier?: string;
  note?: string;
  trackingNumber?: string;
  couponCode?: string;
  subOrderId?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  items?: BackendOrderItemResponse[];
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  shippingAddress?: BackendAddressSummary;
}

interface BackendOrderTreeItem {
  id?: string;
  productId?: string;
  productSlug?: string;
  name?: string;
  sku?: string;
  variant?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  image?: string;
}

interface BackendOrderTreeSubOrder {
  id?: string;
  code?: string;
  vendorId?: string;
  vendorName?: string;
  status?: string;
  totalAmount?: number;
  trackingNumber?: string;
  createdAt?: string;
  updatedAt?: string;
  deliveredAt?: string;
  escrowDeadlineAt?: string;
  vendorConfirmationDeadlineAt?: string;
  items?: BackendOrderTreeItem[];
}

interface BackendOrderTimelineEntry {
  at?: string;
  text?: string;
  tone?: string;
}

interface BackendOrderTreeResponse {
  id: string;
  code?: string;
  createdAt?: string;
  deliveredAt?: string;
  escrowDeadlineAt?: string;
  status?: string;
  vendorConfirmationDeadlineAt?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  subtotal?: number;
  shippingFee?: number;
  discount?: number;
  totalAmount?: number;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  shippingAddress?: BackendAddressSummary;
  items?: BackendOrderTreeItem[];
  subOrders?: BackendOrderTreeSubOrder[];
  timeline?: BackendOrderTimelineEntry[];
}

export interface VnpayCreatePayUrlResponse {
  paymentUrl: string;
  orderCode: string;
  txnRef: string;
  expiresAt?: string;
}

export interface VnpayReturnVerifyResponse {
  status: 'success' | 'failed' | 'pending';
  orderCode?: string;
  amount?: number;
  responseCode?: string;
  transactionStatus?: string;
  orderPaid: boolean;
  message?: string;
}

export interface MomoCreatePayUrlResponse {
  paymentUrl: string;
  orderCode: string;
  requestId?: string;
  deeplink?: string;
  qrCodeUrl?: string;
}

export interface MomoReturnVerifyResponse {
  status: 'success' | 'failed' | 'pending';
  orderCode?: string;
  amount?: number;
  resultCode?: string;
  orderPaid: boolean;
  message?: string;
}



const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_CODE_PATTERN = /^DH-\d{6}-\d{6}$/i;

const backendStatusToClientStatus = (status?: string): ClientOrderStatus => {
  switch ((status || '').toUpperCase()) {
    case 'CONFIRMED':
    case 'PROCESSING':
      return 'processing';
    case 'SHIPPED':
      return 'shipping';
    case 'DELIVERED':
    case 'RETURNING':
      return 'delivered';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
};

const backendPaymentStatusToClient = (status?: string, paymentMethod?: string) => {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'PAID') return 'paid' as const;
  if (normalized === 'REFUND_PENDING') return 'refund_pending' as const;
  if (normalized === 'REFUNDED') return 'refunded' as const;
  if (paymentMethod?.toUpperCase() === 'COD') return 'cod_uncollected' as const;
  return 'unpaid' as const;
};

const formatBackendAddress = (address?: BackendAddressSummary) =>
  [address?.detail || address?.address, address?.ward, address?.district, address?.province || address?.city]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(', ');

const normalizeTimelineTone = (tone?: string): 'success' | 'pending' | 'error' | 'neutral' | 'info' => {
  const normalized = String(tone || '').trim().toLowerCase();
  if (normalized === 'success' || normalized === 'pending' || normalized === 'error' || normalized === 'neutral' || normalized === 'info') {
    return normalized;
  }
  return 'neutral';
};

const localizeTimelineText = (rawText?: string): string => {
  const text = String(rawText || '').trim();
  if (!text) return '';

  return text
    .replace(/Don hang da duoc tao\./g, 'Đơn hàng đã được tạo.')
    .replace(/Don hang moi duoc tao\./g, 'Đơn hàng mới được tạo.')
    .replace(/Don hang da duoc tiep nhan va cho nguoi ban xac nhan\./g, 'Đơn hàng đã được tiếp nhận và chờ người bán xác nhận.')
    .replace(/Nguoi ban da xac nhan don hang\./g, 'Người bán đã xác nhận đơn hàng.')
    .replace(/Don hang dang duoc chuan bi\./g, 'Đơn hàng đang được chuẩn bị.')
    .replace(/Don hang da ban giao cho don vi van chuyen\./g, 'Đơn hàng đã bàn giao cho đơn vị vận chuyển.')
    .replace(/Don hang da giao thanh cong\./g, 'Đơn hàng đã giao thành công.')
    .replace(/Don hang da bi huy\./g, 'Đơn hàng đã bị hủy.')
    .replace(/Da cap nhat thong tin van chuyen/gi, 'Đã cập nhật thông tin vận chuyển')
    .replace(/Cap nhat don hang\./gi, 'Cập nhật đơn hàng.')
    .replace(/Dang cho xu ly/gi, 'Đang chờ xử lý')
    .replace(/Cho nguoi ban xac nhan/gi, 'Chờ người bán xác nhận')
    .replace(/Nguoi ban da xac nhan/gi, 'Người bán đã xác nhận')
    .replace(/Don hang dang duoc chuan bi/gi, 'Đơn hàng đang được chuẩn bị')
    .replace(/Don hang dang duoc giao/gi, 'Đơn hàng đang được giao')
    .replace(/Don hang da giao thanh cong/gi, 'Đơn hàng đã giao thành công')
    .replace(/Don hang da bi huy/gi, 'Đơn hàng đã bị hủy')
    .replace(/Don hang/gi, 'Đơn hàng')
    .replace(/Nguoi ban/gi, 'Người bán')
    .replace(/Ma van don/gi, 'Mã vận đơn')
    .replace(/Don vi van chuyen/gi, 'Đơn vị vận chuyển')
    .replace(/Ly do/gi, 'Lý do');
};

const mapBackendTimelineEntries = (timeline?: BackendOrderTimelineEntry[]) =>
  (timeline || [])
    .map((entry) => {
      const text = localizeTimelineText(entry.text);
      if (!text) return null;
      const resolvedDate = entry.at ? new Date(entry.at) : new Date();
      const time = Number.isNaN(resolvedDate.getTime())
        ? String(entry.at || '')
        : resolvedDate.toLocaleString('vi-VN');
      return {
        time: time || new Date().toLocaleString('vi-VN'),
        text,
        tone: normalizeTimelineTone(entry.tone),
      };
    })
    .filter((entry): entry is { time: string; text: string; tone: 'success' | 'pending' | 'error' | 'neutral' | 'info' } => Boolean(entry));

const isVendorSlaAutoCancelText = (value?: string): boolean => {
  const normalized = String(value || '').toLowerCase();
  return normalized.includes('sla_auto_cancelled')
    || normalized.includes('không xác nhận trong')
    || normalized.includes('không xử lý quá')
    || normalized.includes('tự hủy do shop');
};

const resolveOrderTreeVendorDeadline = (order: BackendOrderTreeResponse): string | undefined => {
  const pendingDeadlines = (order.subOrders || [])
    .filter((subOrder) => backendStatusToClientStatus(subOrder.status) === 'pending')
    .map((subOrder) => subOrder.vendorConfirmationDeadlineAt)
    .filter((value): value is string => Boolean(value));

  if (pendingDeadlines.length > 0) {
    return pendingDeadlines.sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0];
  }

  return order.vendorConfirmationDeadlineAt;
};

const mapBackendOrderToShared = (order: BackendOrderResponse): SharedOrder => {
  const clientStatus = backendStatusToClientStatus(order.status);
  return {
    id: order.id,
    code: order.code || order.id,
    createdAt: order.createdAt || new Date().toISOString(),
    deliveredAt: order.deliveredAt,
    escrowDeadlineAt: order.escrowDeadlineAt,
    vendorConfirmationDeadlineAt: order.vendorConfirmationDeadlineAt,
    parentOrderId: order.subOrderId || undefined,
    storeId: order.storeId || undefined,
    storeName: order.storeName || undefined,
    customerName: order.shippingAddress?.fullName || order.customer?.name || 'Khách hàng',
    customerEmail: order.customer?.email || '',
    customerPhone: order.shippingAddress?.phone || order.customer?.phone || '',
    customerAvatar: 'KH',
    address: formatBackendAddress(order.shippingAddress),
    shipMethod: order.carrier || 'Marketplace delivery',
    tracking: order.trackingNumber || '',
    note: order.note || '',
    paymentMethod: order.paymentMethod || 'COD',
    paymentStatus: backendPaymentStatusToClient(order.paymentStatus, order.paymentMethod),
    couponCode: order.couponCode,
    fulfillment: clientStatusToFulfillment(clientStatus),
    items: (order.items || []).map((item, index) => ({
      id: item.id || `${order.id}-${index + 1}`,
      productId: item.productId,
      productSlug: item.productSlug,
      name: item.name || item.productName || `Item ${index + 1}`,
      price: Number(item.price || item.unitPrice || 0),
      image: item.image || item.productImage || '',
      quantity: item.quantity || 0,
      size: item.variant || item.variantName,
    })),
    subtotal: Number(order.subtotal || 0),
    shippingFee: Number(order.shippingFee || 0),
    discount: Number(order.discount || 0),
    total: Number(order.total || 0),
    cancelReason: clientStatus === 'cancelled' && isVendorSlaAutoCancelText(order.note)
      ? 'Đơn tự hủy do shop không xử lý quá 3 ngày.'
      : undefined,
    timeline: [
      {
        time: new Date(order.createdAt || Date.now()).toLocaleString('vi-VN'),
        text: 'Đơn hàng đã được tạo trên backend marketplace.',
        tone: 'success',
      },
    ],
  };
};

const mapBackendOrderTreeToShared = (order: BackendOrderTreeResponse): SharedOrder => {
  const customerName = order.shippingAddress?.fullName || order.customer?.name || 'Khách hàng';
  const subOrders = order.subOrders || [];
  const rootItems = order.items || [];
  const backendTimeline = mapBackendTimelineEntries(order.timeline);
  const vendorConfirmationDeadlineAt = resolveOrderTreeVendorDeadline(order);
  const hasSlaAutoCancel = backendTimeline.some((entry) => isVendorSlaAutoCancelText(entry.text))
    || (order.timeline || []).some((entry) => isVendorSlaAutoCancelText(entry.text));

  const normalizedItems = subOrders.length > 0
    ? subOrders.flatMap((subOrder) =>
      (subOrder.items || []).map((item, itemIndex) => ({
        id: item.id || `${subOrder.id || order.id}-${itemIndex + 1}`,
        productId: item.productId,
        productSlug: item.productSlug,
        name: item.name || `Item ${itemIndex + 1}`,
        price: Number(item.unitPrice || item.totalPrice || 0),
        image: item.image || '',
        quantity: item.quantity || 0,
        size: item.variant || '',
        storeId: subOrder.vendorId,
        storeName: subOrder.vendorName,
      })),
    )
    : rootItems.map((item, itemIndex) => ({
      id: item.id || `${order.id}-${itemIndex + 1}`,
      productId: item.productId,
      productSlug: item.productSlug,
      name: item.name || `Item ${itemIndex + 1}`,
      price: Number(item.unitPrice || item.totalPrice || 0),
      image: item.image || '',
      quantity: item.quantity || 0,
      size: item.variant || '',
      storeId: undefined,
      storeName: undefined,
    }));

  const firstTracking = subOrders.find((subOrder) => Boolean(subOrder.trackingNumber))?.trackingNumber || '';

  return {
    id: order.id,
    code: order.code || order.id,
    createdAt: order.createdAt || new Date().toISOString(),
    deliveredAt: order.deliveredAt,
    escrowDeadlineAt: order.escrowDeadlineAt,
    vendorConfirmationDeadlineAt,
    customerName,
    customerEmail: order.customer?.email || '',
    customerPhone: order.shippingAddress?.phone || order.customer?.phone || '',
    customerAvatar: 'KH',
    address: formatBackendAddress(order.shippingAddress),
    shipMethod: 'Marketplace delivery',
    tracking: firstTracking,
    note: '',
    paymentMethod: order.paymentMethod || 'COD',
    paymentStatus: backendPaymentStatusToClient(order.paymentStatus, order.paymentMethod),
    fulfillment: clientStatusToFulfillment(backendStatusToClientStatus(order.status)),
    items: normalizedItems,
    subtotal: Number(order.subtotal || 0),
    shippingFee: Number(order.shippingFee || 0),
    discount: Number(order.discount || 0),
    total: Number(order.totalAmount || 0),
    timeline: backendTimeline.length > 0
      ? backendTimeline
      : [
        {
          time: new Date(order.createdAt || Date.now()).toLocaleString('vi-VN'),
          text: 'Đơn hàng đã được tạo.',
          tone: 'success',
        },
        ...subOrders.map((subOrder) => ({
          time: new Date(subOrder.updatedAt || subOrder.createdAt || order.createdAt || Date.now()).toLocaleString('vi-VN'),
          text: `${subOrder.vendorName || 'Người bán'} - ${subOrder.status || 'PENDING'}`,
          tone: 'neutral' as const,
        })),
      ],
    cancelReason: backendStatusToClientStatus(order.status) === 'cancelled' && hasSlaAutoCancel
      ? 'Đơn tự hủy do shop không xử lý quá 3 ngày.'
      : undefined,
  };
};

const syncBackendOrderToSharedStore = (order: SharedOrder) => {
  const shared = order;
  sharedOrderStore.upsert(shared);
};

const toClientOrder = (o: SharedOrder): Order => ({
  id: o.id,
  code: o.code || o.id,
  createdAt: o.createdAt,
  deliveredAt: o.deliveredAt,
  escrowDeadlineAt: o.escrowDeadlineAt,
  vendorConfirmationDeadlineAt: o.vendorConfirmationDeadlineAt,
  status: fulfillmentToClientStatus(o.fulfillment, o.paymentStatus) as OrderStatus,
  total: o.total,
  items: o.items.map((item): OrderItem => ({
    id: item.id,
    productId: item.productId,
    productSlug: item.productSlug,
    name: item.name,
    price: item.price,
    originalPrice: item.originalPrice,
    image: item.image,
    quantity: item.quantity,
    color: item.color,
    size: item.size,
  })),
  addressSummary: `${o.customerName}, ${o.customerPhone}, ${o.address}`,
  paymentMethod: o.paymentMethod,
  statusSteps: o.timeline.map((t): OrderStatusStep => ({
    label: localizeTimelineText(t.text),
    timestamp: t.time,
  })),
  cancelReason: o.cancelReason,
  cancelledAt: o.cancelledAt,
  tracking: o.tracking,
  shippingFee: o.shippingFee,
  discount: o.discount,
  // Multi-vendor fields
  parentOrderId: o.parentOrderId,
  storeId: o.storeId,
  storeName: o.storeName,
});


export const orderService = {
  isBackendReadyItemId(id: string): boolean {
    return UUID_PATTERN.test(id);
  },

  async createBackendOrder(input: {
    addressId: string;
    paymentMethod: string;
    customerVoucherId?: string;
    couponCode?: string;
    note?: string;
    items: BackendOrderRequestItem[];
  }) {
    const order = await apiRequest<BackendOrderResponse>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(input),
    }, { auth: true });
    syncBackendOrderToSharedStore(mapBackendOrderToShared(order));
    return order;
  },

  async listFromBackend(): Promise<Order[]> {
    const orders = await apiRequest<BackendOrderResponse[]>('/api/orders', {}, { auth: true });
    const mapped = (orders || []).map(mapBackendOrderToShared);
    sharedOrderStore.replaceAll(mapped);
    return mapped.map(toClientOrder);
  },

  async getByIdFromBackend(id: string): Promise<Order | null> {
    try {
      const normalizedId = String(id || '').trim();
      if (!normalizedId) {
        return null;
      }
      if (!UUID_PATTERN.test(normalizedId) && !ORDER_CODE_PATTERN.test(normalizedId)) {
        return null;
      }

      const path = UUID_PATTERN.test(normalizedId)
        ? `/api/orders/${normalizedId}/tree`
        : `/api/orders/code/${encodeURIComponent(normalizedId)}/tree`;
      const order = await apiRequest<BackendOrderTreeResponse>(path, {}, { auth: true });
      const mapped = mapBackendOrderTreeToShared(order);
      syncBackendOrderToSharedStore(mapped);
      return toClientOrder(mapped);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async cancelOnBackend(id: string, reason: string): Promise<Order | null> {
    if (!UUID_PATTERN.test(id)) {
      throw new Error('Mã đơn hàng không hợp lệ.');
    }

    const updated = await apiRequest<BackendOrderResponse>(`/api/orders/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }, { auth: true });
    const mapped = mapBackendOrderToShared(updated);
    syncBackendOrderToSharedStore(mapped);
    return toClientOrder(mapped);
  },

  async createVnpayPayUrl(orderCode: string): Promise<VnpayCreatePayUrlResponse> {
    const normalized = String(orderCode || '').trim();
    if (!normalized) {
      throw new Error('Order code is required');
    }
    return apiRequest<VnpayCreatePayUrlResponse>(
      `/api/payments/vnpay/orders/${encodeURIComponent(normalized)}/pay-url`,
      { method: 'POST' },
      { auth: true },
    );
  },

  async verifyVnpayReturn(search: string): Promise<VnpayReturnVerifyResponse> {
    const query = String(search || '').trim().replace(/^\?/, '');
    const path = query
      ? `/api/payments/vnpay/return/verify?${query}`
      : '/api/payments/vnpay/return/verify';
    return apiRequest<VnpayReturnVerifyResponse>(path);
  },

  async createMomoPayUrl(orderCode: string): Promise<MomoCreatePayUrlResponse> {
    const normalized = String(orderCode || '').trim();
    if (!normalized) {
      throw new Error('Order code is required');
    }
    return apiRequest<MomoCreatePayUrlResponse>(
      `/api/payments/momo/orders/${encodeURIComponent(normalized)}/pay-url`,
      { method: 'POST' },
      { auth: true },
    );
  },

  async verifyMomoReturn(search: string): Promise<MomoReturnVerifyResponse> {
    const query = String(search || '').trim().replace(/^\?/, '');
    const path = query
      ? `/api/payments/momo/return/verify?${query}`
      : '/api/payments/momo/return/verify';
    return apiRequest<MomoReturnVerifyResponse>(path);
  },
};
