import type { Address, Order } from '../../../types';
import type { Notification } from '../../../services/notificationService';
import type { CustomerWalletVoucher } from '../../../services/customerVoucherService';
import type { Review as CustomerReview } from '../../../services/reviewService';

export type ProfileTabId = 'account' | 'orders' | 'vouchers' | 'addresses' | 'reviews' | 'notifications';
export type ProfilePageChangeHandler = (nextPage: number | ((current: number) => number)) => void;

export interface PendingProduct {
  productId: string;
  productName: string;
  productImage: string;
  orderId: string;
  orderCode?: string;
  variant: string;
}

export interface UserSummary {
  name: string;
  phone: string;
  gender: string;
  dob: string;
  height: string;
  weight: string;
  email: string;
}

export interface VoucherMeta {
  text: string;
  tone: 'used' | 'expired' | 'revoked' | 'available';
}

export interface ProfileTabContentProps {
  activeTab: ProfileTabId;
  user: UserSummary;
  profileLoading: boolean;
  profileError: string | null;
  orderFilter: string;
  onOrderFilterChange: (nextFilter: string) => void;
  orders: Order[];
  ordersLoading: boolean;
  ordersError: string | null;
  orderPage: number;
  ordersPerPage: number;
  onOrderPageChange: ProfilePageChangeHandler;
  orderStatusLabelMap?: Record<string, string>;
  onOpenOrderDetail: (order: Order) => void;
  onRequestCancelOrder: (orderId: string) => void;
  onRequestCancelReturn: (returnId: string) => void;
  onOpenReturnDrawer: (order: Order) => void;
  onOpenReviewForOrder: (order: Order) => void;
  vouchers: CustomerWalletVoucher[];
  pagedVouchers: CustomerWalletVoucher[];
  voucherPage: number;
  totalVoucherPages: number;
  vouchersPerPage: number;
  onVoucherPageChange: ProfilePageChangeHandler;
  getVoucherMeta: (voucher: CustomerWalletVoucher) => VoucherMeta;
  isMarketplaceVoucher: (voucher: CustomerWalletVoucher) => boolean;
  addressesLoading: boolean;
  addressesError: string | null;
  savedAddresses: Address[];
  onAddAddress: () => void;
  onEditAddress: (address: Address) => void;
  onRequestDeleteAddress: (addressId: string) => void;
  reviewFilter: 'pending' | 'completed';
  onReviewFilterChange: (nextFilter: 'pending' | 'completed') => void;
  pendingReviews: PendingProduct[];
  completedReviews: CustomerReview[];
  reviewsLoading: boolean;
  reviewsError: string | null;
  pendingReviewPage: number;
  completedReviewPage: number;
  reviewsPerPage: number;
  onPendingReviewPageChange: ProfilePageChangeHandler;
  onCompletedReviewPageChange: ProfilePageChangeHandler;
  getOrderDisplayCode: (orderId: string, orderCode?: string) => string;
  onOpenReviewModal: (product: PendingProduct) => void;
  notifications: Notification[];
  unreadCount: number;
  notificationPage: number;
  notificationsPerPage: number;
  onNotificationPageChange: ProfilePageChangeHandler;
  onMarkAllNotificationsRead: () => void;
  onNotificationClick: (notification: Notification) => void;
  onDeleteNotification: (notificationId: string) => void;
  onOpenAccountModal: () => void;
  onOpenPasswordModal: () => void;
}
