/**
 * sharedOrderStore.ts — Order cache layer used by customer flows.
 *
 * Status Mapping:
 *   Client OrderStatus  | Admin FulfillmentStatus
 *   -------------------|------------------------
 *   pending             | pending
 *   processing          | packing
 *   shipping            | shipping
 *   delivered           | done
 *   cancelled           | canceled
 *   refunded            | canceled + paymentStatus=refunded
 */

import type { FulfillmentStatus, PaymentStatus } from '../pages/Admin/orderWorkflow';

const ENABLE_ORDER_SEED_DATA = import.meta.env.VITE_ENABLE_ORDER_SEED_DATA === 'true';
const ENABLE_ORDER_LOCAL_CACHE = import.meta.env.VITE_ENABLE_ORDER_LOCAL_CACHE === 'true';

// ── Unified Order Schema ───────────────────────────────────────────────────
export interface SharedOrderItem {
  id: string;
  productId?: string;
  productSlug?: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  quantity: number;
  color?: string;
  size?: string;
  // Multi-vendor support
  storeId?: string;
  storeName?: string;
}

export interface SharedOrder {
  // Identity
  id: string;            // backend UUID
  code?: string;         // public code for display
  createdAt: string;     // ISO string
  deliveredAt?: string;
  escrowDeadlineAt?: string;
  vendorConfirmationDeadlineAt?: string;
  
  // Multi-vendor: parent order ID for sub-orders
  parentOrderId?: string;  // If set, this is a sub-order belonging to a parent
  storeId?: string;        // Vendor's store ID (null = platform order or parent)
  storeName?: string;      // Vendor's store name

  // Customer
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAvatar: string;

  // Shipping
  address: string;
  shipMethod: string;
  tracking: string;
  note: string;

  // Payment
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  couponCode?: string;

  // Fulfillment (admin vocabulary)
  fulfillment: FulfillmentStatus;

  // Line items & pricing
  items: SharedOrderItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;

  // Timeline
  timeline: Array<{ time: string; text: string; tone: 'success' | 'pending' | 'error' | 'neutral' | 'info' }>;

  // Cancel info
  cancelReason?: string;
  cancelledAt?: string;
}

// ── Status Mapping Helpers ─────────────────────────────────────────────────

/** Map admin FulfillmentStatus → client display status label */
export type ClientOrderStatus = 'pending' | 'processing' | 'shipping' | 'delivered' | 'cancelled' | 'refunded';

export const fulfillmentToClientStatus = (
  fulfillment: FulfillmentStatus,
  paymentStatus: PaymentStatus,
): ClientOrderStatus => {
  if (fulfillment === 'canceled') {
    return paymentStatus === 'refunded' ? 'refunded' : 'cancelled';
  }
  const map: Record<FulfillmentStatus, ClientOrderStatus> = {
    pending: 'pending',
    packing: 'processing',
    shipping: 'shipping',
    done: 'delivered',
    canceled: 'cancelled',
  };
  return map[fulfillment];
};

export const clientStatusToFulfillment = (status: ClientOrderStatus): FulfillmentStatus => {
  const map: Record<ClientOrderStatus, FulfillmentStatus> = {
    pending: 'pending',
    processing: 'packing',
    shipping: 'shipping',
    delivered: 'done',
    cancelled: 'canceled',
    refunded: 'canceled',
  };
  return map[status];
};

// ── Optional Seed Data (dev only via VITE_ENABLE_ORDER_SEED_DATA=true) ─────
const SEED_ORDERS: SharedOrder[] = [
  {
    id: 'ORD-10235',
    createdAt: '2026-03-10T11:12:00',
    customerName: 'Đỗ Gia Linh',
    customerEmail: 'dogialinh@example.com',
    customerPhone: '0913 668 899',
    customerAvatar: 'https://ui-avatars.com/api/?name=Do+Gia+Linh&background=22C55E&color=fff',
    address: '25 Trần Quang Khải, Quận 1, TP.HCM',
    shipMethod: 'GHN - Giao tiêu chuẩn',
    tracking: 'GHN10235VN',
    note: 'Nhận hàng sau 18h, hỗ trợ gọi trước khi giao.',
    paymentMethod: 'COD',
    paymentStatus: 'cod_uncollected',
    fulfillment: 'pending',
    couponCode: '',
    items: [
      { id: '1', name: 'Áo Polo Coolmax', color: 'Navy', size: 'L', quantity: 1, price: 399000, image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=200&h=260&q=80' },
      { id: '2', name: 'Quần Kaki Slim', color: 'Be', size: '32', quantity: 1, price: 499000, image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=200&h=260&q=80' },
    ],
    subtotal: 898000, shippingFee: 30000, discount: 0, total: 928000,
    timeline: [
      { time: '11:12 10/03/2026', text: 'Khách đặt hàng thành công.', tone: 'success' },
      { time: '11:15 10/03/2026', text: 'Hệ thống ghi nhận đơn COD chờ xác nhận.', tone: 'pending' },
    ],
  },
  {
    id: 'ORD-10234',
    createdAt: '2026-03-09T14:30:00',
    customerName: 'Nguyễn Minh Tuấn',
    customerEmail: 'minhtuan@example.com',
    customerPhone: '0987 654 321',
    customerAvatar: 'https://ui-avatars.com/api/?name=Nguyen+Minh+Tuan&background=3B82F6&color=fff',
    address: '12 Lê Lợi, Quận 3, TP.HCM',
    shipMethod: 'GHTK - Giao nhanh',
    tracking: 'GHTK10234VN',
    note: '',
    paymentMethod: 'VNPay',
    paymentStatus: 'paid',
    fulfillment: 'packing',
    couponCode: 'SUMMER20',
    items: [
      { id: '3', name: 'Áo Thun Basic', color: 'Trắng', size: 'M', quantity: 2, price: 199000, image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=200&h=260&q=80' },
    ],
    subtotal: 398000, shippingFee: 25000, discount: 79600, total: 343400,
    timeline: [
      { time: '14:30 09/03/2026', text: 'Khách đặt hàng và thanh toán VNPay thành công.', tone: 'success' },
      { time: '15:00 09/03/2026', text: 'Đơn đang được đóng gói.', tone: 'pending' },
    ],
  },
  {
    id: 'ORD-10233',
    createdAt: '2026-03-08T09:00:00',
    customerName: 'Trần Thị Lan',
    customerEmail: 'thilan@example.com',
    customerPhone: '0905 111 222',
    customerAvatar: 'https://ui-avatars.com/api/?name=Tran+Thi+Lan&background=EC4899&color=fff',
    address: '45 Hoàng Diệu, Quận 4, TP.HCM',
    shipMethod: 'GHN - Giao tiêu chuẩn',
    tracking: 'GHN10233VN',
    note: 'Gọi trước khi giao.',
    paymentMethod: 'MoMo',
    paymentStatus: 'paid',
    fulfillment: 'shipping',
    couponCode: 'FREESHIP',
    items: [
      { id: '4', name: 'Váy Midi Floral', color: 'Hồng', size: 'S', quantity: 1, price: 459000, image: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=200&h=260&q=80' },
    ],
    subtotal: 459000, shippingFee: 0, discount: 30000, total: 429000,
    timeline: [
      { time: '09:00 08/03/2026', text: 'Đặt hàng thành công qua MoMo.', tone: 'success' },
      { time: '10:00 08/03/2026', text: 'Đóng gói hoàn tất.', tone: 'success' },
      { time: '11:30 08/03/2026', text: 'Bàn giao đơn vị vận chuyển GHN.', tone: 'success' },
    ],
  },
  {
    id: 'DH123456',
    createdAt: '2026-03-10T10:30:00Z',
    customerName: 'Anh Thịnh',
    customerEmail: 'anhthinh@example.com',
    customerPhone: '0382253049',
    customerAvatar: 'https://ui-avatars.com/api/?name=Anh+Thinh&background=F59E0B&color=fff',
    address: 'Hùng Sơn, Đại Từ, Thái Nguyên',
    shipMethod: 'GHN - Giao tiêu chuẩn',
    tracking: '',
    note: '',
    paymentMethod: 'VNPAY',
    paymentStatus: 'paid',
    fulfillment: 'shipping',
    items: [
      { id: '101', name: 'Áo Polo Nam Cotton Khử Mùi', color: 'Đen', size: 'L', quantity: 1, price: 359000, image: 'https://media.coolmate.me/cdn-cgi/image/width=320,height=470,quality=85/uploads/February2025/11025595_24_copy_11.jpg' },
      { id: '105', name: 'Quần Shorts Nam Thể Thao Co Giãn', color: 'Đen', size: 'M', quantity: 2, price: 249000, image: 'https://media.coolmate.me/cdn-cgi/image/width=320,height=470,quality=85/uploads/November2024/24CMCW.AT012.2_72.jpg' },
    ],
    subtotal: 857000, shippingFee: 30000, discount: 0, total: 958000,
    timeline: [
      { time: '10:35 10/03/2026', text: 'Đơn hàng đã được tiếp nhận.', tone: 'success' },
      { time: '16:00 10/03/2026', text: 'Kho đang đóng gói.', tone: 'success' },
      { time: '08:20 11/03/2026', text: 'Đã bàn giao cho đơn vị vận chuyển.', tone: 'success' },
    ],
  },
  {
    id: 'DH123455',
    createdAt: '2026-02-28T09:10:00Z',
    customerName: 'Anh Thịnh',
    customerEmail: 'anhthinh@example.com',
    customerPhone: '0382253049',
    customerAvatar: 'https://ui-avatars.com/api/?name=Anh+Thinh&background=F59E0B&color=fff',
    address: 'Hùng Sơn, Đại Từ, Thái Nguyên',
    shipMethod: 'GHN - Giao tiêu chuẩn',
    tracking: '',
    note: '',
    paymentMethod: 'COD',
    paymentStatus: 'paid',
    fulfillment: 'done',
    items: [
      { id: '208', name: 'Áo Dây Cami Lụa Mát Mẻ', color: 'Trắng', size: 'S', quantity: 1, price: 159000, image: 'https://media.coolmate.me/cdn-cgi/image/width=320,height=470,quality=85/uploads/November2024/24CMCW.AT005.5_88.jpg' },
      { id: '201', name: 'Váy Liền Nữ Cổ Khuy Thanh Lịch', color: 'Đen', size: 'M', quantity: 1, price: 240000, image: 'https://media.coolmate.me/cdn-cgi/image/width=320,height=470,quality=85/uploads/November2024/24CMCW.DK001.2_77.jpg' },
    ],
    subtotal: 399000, shippingFee: 0, discount: 0, total: 399000,
    timeline: [
      { time: '09:12 28/02/2026', text: 'Tiếp nhận đơn.', tone: 'success' },
      { time: '12:00 28/02/2026', text: 'Đang đóng gói.', tone: 'success' },
      { time: '08:00 01/03/2026', text: 'Đang giao.', tone: 'success' },
      { time: '11:25 02/03/2026', text: 'Giao thành công.', tone: 'success' },
    ],
  },
];

// ── In-memory store ────────────────────────────────────────────────────────
const loadFromStorage = (): SharedOrder[] => {
  if (!ENABLE_ORDER_LOCAL_CACHE) {
    return ENABLE_ORDER_SEED_DATA ? [...SEED_ORDERS] : [];
  }

  try {
    const raw = localStorage.getItem('coolmate_shared_orders_v1');
    if (!raw) return ENABLE_ORDER_SEED_DATA ? [...SEED_ORDERS] : [];
    const parsed: SharedOrder[] = JSON.parse(raw);
    if (!ENABLE_ORDER_SEED_DATA) return parsed;
    const storageIds = new Set(parsed.map((o) => o.id));
    const missingSeeds = SEED_ORDERS.filter((s) => !storageIds.has(s.id));
    return [...parsed, ...missingSeeds];
  } catch {
    return ENABLE_ORDER_SEED_DATA ? [...SEED_ORDERS] : [];
  }
};

const saveToStorage = (orders: SharedOrder[]) => {
  if (!ENABLE_ORDER_LOCAL_CACHE) {
    return;
  }

  try {
    localStorage.setItem('coolmate_shared_orders_v1', JSON.stringify(orders));
  } catch {
    // ignore
  }
};

let _orders: SharedOrder[] = loadFromStorage();

// ── Store API ──────────────────────────────────────────────────────────────
export const sharedOrderStore = {
  upsert(order: SharedOrder) {
    const idx = _orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) {
      _orders[idx] = { ...order };
    } else {
      _orders = [order, ..._orders];
    }
    saveToStorage(_orders);
  },

  replaceAll(orders: SharedOrder[]) {
    _orders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    saveToStorage(_orders);
  },
};
