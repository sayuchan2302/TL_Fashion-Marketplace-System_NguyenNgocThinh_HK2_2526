export type OrderStatus = 'pending' | 'processing' | 'shipping' | 'delivered' | 'cancelled' | 'refunded';

export interface OrderStatusStep {
  label: string;
  timestamp: string;
  description?: string;
}

export interface OrderItem {
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
  // Multi-vendor fields
  storeId?: string;
  storeName?: string;
}

export interface Order {
  id: string;
  code?: string;
  createdAt: string;
  deliveredAt?: string;
  escrowDeadlineAt?: string;
  vendorConfirmationDeadlineAt?: string;
  status: OrderStatus;
  total: number;
  items: OrderItem[];
  addressSummary: string;
  paymentMethod: string;
  statusSteps: OrderStatusStep[];
  cancelReason?: string;
  cancelledAt?: string;
  tracking?: string;
  shippingFee?: number;
  discount?: number;
  // Multi-vendor: sub-order support
  parentOrderId?: string;  // If set, this is a sub-order
  storeId?: string;        // Vendor's store ID
  storeName?: string;      // Vendor's store name
}
