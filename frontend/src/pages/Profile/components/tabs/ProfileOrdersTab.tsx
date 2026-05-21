import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Package, RotateCcw } from 'lucide-react';
import EmptyState from '../../../../components/EmptyState/EmptyState';
import ProfilePagination from '../ProfilePagination';
import type { ProfileTabContentProps } from '../ProfileTabContent.types';
import { returnService, type ReturnRequest } from '../../../../services/returnService';

const orderFilterOptions = ['Tất cả', 'Chờ xác nhận', 'Đang giao', 'Đã giao', 'Đã hủy', 'Hoàn trả'];

const statusMap: Record<string, string> = {
  'Tất cả': 'all',
  'Chờ xác nhận': 'pending',
  'Đang giao': 'shipping',
  'Đã giao': 'delivered',
  'Đã hủy': 'cancelled',
  'Hoàn trả': 'refunded',
};

const formatVendorDeadlineNotice = (deadline?: string): string | null => {
  if (!deadline) return null;

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return null;

  if (date.getTime() <= Date.now()) {
    return 'Shop đã quá hạn xác nhận. Hệ thống sẽ tự xử lý nếu shop vẫn không phản hồi.';
  }

  return `Shop cần xác nhận trước ${date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}.`;
};

const getOrderSlaNotice = (order: ProfileTabContentProps['orders'][number]): { text: string; tone: 'pending' | 'cancelled' } | null => {
  if (order.status === 'pending') {
    const notice = formatVendorDeadlineNotice(order.vendorConfirmationDeadlineAt);
    return notice ? { text: notice, tone: 'pending' } : null;
  }

  if (order.status === 'cancelled' && order.cancelReason?.includes('shop không xử lý quá 3 ngày')) {
    return { text: 'Đơn tự hủy do shop không xử lý quá 3 ngày.', tone: 'cancelled' };
  }

  return null;
};

const getReturnStatusBadgeLabel = (status: string) => {
  switch (status) {
    case 'PENDING_VENDOR':
      return 'Đang đổi/trả';
    case 'ACCEPTED':
      return 'Chờ gửi hàng';
    case 'SHIPPING':
      return 'Đang vận chuyển';
    case 'RECEIVED':
      return 'Shop đã nhận';
    case 'COMPLETED':
      return 'Trả hàng thành công';
    case 'REJECTED':
      return 'Yêu cầu bị từ chối';
    case 'DISPUTED':
      return 'Tranh chấp';
    default:
      return 'Đang đổi/trả';
  }
};

const hasActiveReturnRequest = (returns: ReturnRequest[], orderId: string) =>
  returns.some((req) => req.orderId === orderId && req.status !== 'CANCELLED');

const OrdersTab = ({
  orderFilter,
  onOrderFilterChange,
  orders,
  ordersLoading,
  ordersError,
  orderPage,
  ordersPerPage,
  onOrderPageChange,
  orderStatusLabelMap,
  onOpenOrderDetail,
  onRequestCancelOrder,
  onOpenReturnDrawer,
  onOpenReviewForOrder,
}: Pick<ProfileTabContentProps,
  | 'orderFilter'
  | 'onOrderFilterChange'
  | 'orders'
  | 'ordersLoading'
  | 'ordersError'
  | 'orderPage'
  | 'ordersPerPage'
  | 'onOrderPageChange'
  | 'orderStatusLabelMap'
  | 'onOpenOrderDetail'
  | 'onRequestCancelOrder'
  | 'onOpenReturnDrawer'
  | 'onOpenReviewForOrder'
>) => {
  const [customerReturns, setCustomerReturns] = useState<ReturnRequest[]>([]);

  useEffect(() => {
    let active = true;
    const fetchReturns = async () => {
      try {
        const data = await returnService.listCustomerReturns();
        if (active) {
          setCustomerReturns(data);
        }
      } catch (error) {
        console.error('Error fetching customer returns:', error);
      }
    };
    void fetchReturns();
    return () => {
      active = false;
    };
  }, [orders]);

  const filteredOrders = useMemo(
    () => {
      if (orderFilter === 'Tất cả') return orders;
      if (orderFilter === 'Hoàn trả') {
        return orders.filter((order) => {
          const hasReturn = hasActiveReturnRequest(customerReturns, order.id);
          return order.status === 'refunded' || hasReturn;
        });
      }
      return orders.filter(
        (order) => order.status === statusMap[orderFilter] && !hasActiveReturnRequest(customerReturns, order.id),
      );
    },
    [orderFilter, orders, customerReturns],
  );

  const totalOrderPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPerPage));
  const safeOrderPage = Math.min(orderPage, totalOrderPages);
  const pagedOrders = useMemo(() => {
    const start = (safeOrderPage - 1) * ordersPerPage;
    return filteredOrders.slice(start, start + ordersPerPage);
  }, [filteredOrders, ordersPerPage, safeOrderPage]);

  useEffect(() => {
    onOrderPageChange(1);
  }, [orderFilter, onOrderPageChange]);

  useEffect(() => {
    if (orderPage > totalOrderPages) {
      onOrderPageChange(totalOrderPages);
    }
  }, [orderPage, onOrderPageChange, totalOrderPages]);

  return (
    <div className="tab-pane">
      <div className="profile-content-header">
        <h2 className="profile-content-title">Lịch sử đơn hàng</h2>
      </div>

      <div className="order-filter-tabs">
        {orderFilterOptions.map((status) => (
          <button
            key={status}
            className={`order-filter-btn ${orderFilter === status ? 'active' : ''}`}
            onClick={() => onOrderFilterChange(status)}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="order-list">
        {ordersLoading ? (
          <div className="account-meta">Đang tải đơn hàng...</div>
        ) : ordersError ? (
          <div className="account-meta">{ordersError}</div>
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            icon={<Package size={80} strokeWidth={1} />}
            title="Bạn chưa có đơn hàng nào"
            description="Hãy trải nghiệm các sản phẩm của Coolmate để bắt đầu hành trình mua sắm của bạn!"
            actionText="Mua sắm ngay"
            actionLink="/"
          />
        ) : (
          pagedOrders.map((order) => {
            const slaNotice = getOrderSlaNotice(order);
            const activeReturn = customerReturns.find((req) => req.orderId === order.id && req.status !== 'CANCELLED');
            const displayStatusText = activeReturn
              ? getReturnStatusBadgeLabel(activeReturn.status)
              : (orderStatusLabelMap[order.status] ?? order.status);

            const displayStatusClass = activeReturn
              ? (activeReturn.status === 'COMPLETED' ? 'refunded' : 'returning')
              : order.status;

            return (
              <div key={order.id} className="order-card">
                <div className="order-card-header">
                  <div className="order-card-meta">
                    <button className="order-id-link" onClick={() => onOpenOrderDetail(order)}>
                      Mã đơn: #{order.code || order.id}
                    </button>
                    <span className="order-date">{new Date(order.createdAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                  <span className={`order-status-badge status-${displayStatusClass}`}>
                    {displayStatusText}
                  </span>
                </div>
                {slaNotice ? (
                  <div className={`order-sla-note ${slaNotice.tone}`}>
                    {slaNotice.text}
                  </div>
                ) : null}
                <div className="order-card-items">
                  {order.items.slice(0, 2).map((item, idx) => (
                    <div key={idx} className="order-item">
                      <Link to={`/product/${encodeURIComponent(item.id)}`} className="order-item-img">
                        <img src={item.image} alt={item.name} />
                      </Link>
                      <div className="order-item-info">
                        <p className="order-item-name">{item.name}</p>
                        {item.color && <p className="order-item-variant">Màu: {item.color}</p>}
                        {item.size && <p className="order-item-variant">Size: {item.size}</p>}
                        <p className="order-item-qty">x{item.quantity}</p>
                      </div>
                      <span className="order-item-price">{item.price.toLocaleString('vi-VN')}đ</span>
                    </div>
                  ))}
                  {order.items.length > 2 && <p className="order-more-items">+{order.items.length - 2} sản phẩm khác</p>}
                </div>
                <div className="order-card-footer">
                  <div className="order-total">
                    <span>Tổng cộng:</span>
                    <span className="order-total-price">{order.total.toLocaleString('vi-VN')}đ</span>
                  </div>
                  <div className="order-actions">
                    {order.status === 'pending' && (
                      <button className="order-action-btn order-btn-danger" onClick={() => onRequestCancelOrder(order.id)}>
                        Hủy đơn hàng
                      </button>
                    )}
                    <button className="order-action-btn order-btn-outline" onClick={() => onOpenOrderDetail(order)}>
                      Xem chi tiết
                    </button>
                    {order.status === 'delivered' && (
                      <>
                        {(() => {
                          const activeReq = customerReturns.find(
                            (req) => req.orderId === order.id && req.status !== 'CANCELLED'
                          );
                          if (activeReq) return null;
                          return (
                            <button className="order-action-btn order-btn-outline" onClick={() => onOpenReturnDrawer(order)}>
                              <RotateCcw size={16} /> Đổi / trả hàng
                            </button>
                          );
                        })()}
                        <button className="order-action-btn order-btn-primary" onClick={() => onOpenReviewForOrder(order)}>
                          Đánh giá
                        </button>
                      </>
                    )}
                    {order.status === 'shipping' && <button className="order-action-btn order-btn-primary">Theo dõi đơn</button>}
                    {order.status === 'cancelled' && <button className="order-action-btn order-btn-outline">Mua lại</button>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!ordersLoading && !ordersError && filteredOrders.length > 0 ? (
        <ProfilePagination
          page={safeOrderPage}
          totalItems={filteredOrders.length}
          totalPages={totalOrderPages}
          itemsPerPage={ordersPerPage}
          itemLabel="đơn hàng"
          onPageChange={onOrderPageChange}
        />
      ) : null}
    </div>
  );
};

export default OrdersTab;
