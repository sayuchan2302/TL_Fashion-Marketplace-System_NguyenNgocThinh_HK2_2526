import type { ProfileTabContentProps } from './ProfileTabContent.types';
import AccountTab from './tabs/ProfileAccountTab';
import AddressesTab from './tabs/ProfileAddressesTab';
import NotificationsTab from './tabs/ProfileNotificationsTab';
import OrdersTab from './tabs/ProfileOrdersTab';
import ReviewsTab from './tabs/ProfileReviewsTab';
import VouchersTab from './tabs/ProfileVouchersTab';

const ProfileTabContent = (props: ProfileTabContentProps) => {
  switch (props.activeTab) {
    case 'account':
      return (
        <AccountTab
          user={props.user}
          profileLoading={props.profileLoading}
          profileError={props.profileError}
          onOpenAccountModal={props.onOpenAccountModal}
          onOpenPasswordModal={props.onOpenPasswordModal}
        />
      );
    case 'orders':
      return (
        <OrdersTab
          orderFilter={props.orderFilter}
          onOrderFilterChange={props.onOrderFilterChange}
          orders={props.orders}
          ordersLoading={props.ordersLoading}
          ordersError={props.ordersError}
          orderPage={props.orderPage}
          ordersPerPage={props.ordersPerPage}
          onOrderPageChange={props.onOrderPageChange}
          orderStatusLabelMap={props.orderStatusLabelMap}
          onOpenOrderDetail={props.onOpenOrderDetail}
          onRequestCancelOrder={props.onRequestCancelOrder}
          onRequestCancelReturn={props.onRequestCancelReturn}
          onOpenReturnDrawer={props.onOpenReturnDrawer}
          onOpenReviewForOrder={props.onOpenReviewForOrder}
        />
      );
    case 'vouchers':
      return (
        <VouchersTab
          vouchers={props.vouchers}
          pagedVouchers={props.pagedVouchers}
          voucherPage={props.voucherPage}
          totalVoucherPages={props.totalVoucherPages}
          vouchersPerPage={props.vouchersPerPage}
          onVoucherPageChange={props.onVoucherPageChange}
          getVoucherMeta={props.getVoucherMeta}
          isMarketplaceVoucher={props.isMarketplaceVoucher}
        />
      );
    case 'addresses':
      return (
        <AddressesTab
          addressesLoading={props.addressesLoading}
          addressesError={props.addressesError}
          savedAddresses={props.savedAddresses}
          onAddAddress={props.onAddAddress}
          onEditAddress={props.onEditAddress}
          onRequestDeleteAddress={props.onRequestDeleteAddress}
        />
      );
    case 'reviews':
      return (
        <ReviewsTab
          reviewFilter={props.reviewFilter}
          onReviewFilterChange={props.onReviewFilterChange}
          pendingReviews={props.pendingReviews}
          completedReviews={props.completedReviews}
          reviewsLoading={props.reviewsLoading}
          reviewsError={props.reviewsError}
          pendingReviewPage={props.pendingReviewPage}
          completedReviewPage={props.completedReviewPage}
          reviewsPerPage={props.reviewsPerPage}
          onPendingReviewPageChange={props.onPendingReviewPageChange}
          onCompletedReviewPageChange={props.onCompletedReviewPageChange}
          getOrderDisplayCode={props.getOrderDisplayCode}
          onOpenReviewModal={props.onOpenReviewModal}
        />
      );
    case 'notifications':
      return (
        <NotificationsTab
          notifications={props.notifications}
          unreadCount={props.unreadCount}
          notificationPage={props.notificationPage}
          notificationsPerPage={props.notificationsPerPage}
          onNotificationPageChange={props.onNotificationPageChange}
          onMarkAllNotificationsRead={props.onMarkAllNotificationsRead}
          onNotificationClick={props.onNotificationClick}
          onDeleteNotification={props.onDeleteNotification}
        />
      );
    default:
      return null;
  }
};

export default ProfileTabContent;
