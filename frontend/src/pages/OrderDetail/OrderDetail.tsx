import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Phone,
  CreditCard,
  ArrowLeft,
  RotateCcw,
  Copy,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { orderService } from '../../services/orderService';
import { returnService, type ReturnRequest } from '../../services/returnService';
import { reviewService, type EligibleReviewItem, type Review } from '../../services/reviewService';
import ReviewModal from '../../components/ReviewModal/ReviewModal';
import { formatPrice } from '../../utils/formatters';
import { usePageTitle } from '../../hooks/usePageTitle';
import { resolveDetailRouteKey, toDisplayOrderCode } from '../../utils/displayCode';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import { CLIENT_TEXT } from '../../utils/texts';
import type { Order } from '../../types';
import ReturnRequestDrawer from './ReturnRequestDrawer';
import './OrderDetail.css';
import '../../styles/orderDetailTheme.css';
import { getOptimizedImageUrl } from '../../utils/getOptimizedImageUrl';

const t = CLIENT_TEXT.common;

const CANCEL_REASONS = [
  'Tôi muốn thay đổi địa chỉ giao hàng',
  'Tôi muốn thay đổi sản phẩm (size/màu)',
  'Tôi tìm thấy giá tốt hơn ở nơi khác',
  'Tôi không còn cần sản phẩm này',
  'Đặt nhầm / thay đổi ý định',
  'Lý do khác',
];

const statusColorMap: Record<string, string> = {
  pending: 'status-pending',
  delivered: 'status-delivered',
  shipping: 'status-shipping',
  processing: 'status-processing',
  cancelled: 'status-cancelled',
  refunded: 'status-refunded',
};

interface ReviewProduct {
  productId: string;
  productName: string;
  productImage: string;
  orderId: string;
  variant?: string;
}

const mapEligibleToReviewProduct = (item: EligibleReviewItem): ReviewProduct => {
  const variant = [
    item.variantName?.trim() || null,
    item.quantity > 0 ? `Số lượng: ${item.quantity}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    productId: item.productId,
    productName: item.productName,
    productImage: item.productImage,
    orderId: item.orderId,
    variant: variant || 'Đơn hàng đã giao',
  };
};

const clampReviewRating = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
};

const getOrderSlaNotice = (order: Order): { text: string; tone: 'pending' | 'cancelled' } | null => {
  if (order.status === 'pending' && order.vendorConfirmationDeadlineAt) {
    const deadline = new Date(order.vendorConfirmationDeadlineAt);
    if (Number.isNaN(deadline.getTime())) return null;

    if (deadline.getTime() <= Date.now()) {
      return {
        tone: 'pending',
        text: 'Shop đã quá hạn xác nhận. Hệ thống sẽ tự hủy nếu shop vẫn không xử lý.',
      };
    }

    return {
      tone: 'pending',
      text: `Shop cần xác nhận trước ${deadline.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })}.`,
    };
  }

  if (order.status === 'cancelled' && order.cancelReason?.includes('shop không xử lý quá 3 ngày')) {
    return {
      tone: 'cancelled',
      text: 'Đơn tự hủy do shop không xử lý quá 3 ngày.',
    };
  }

  return null;
};

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolvingReview, setIsResolvingReview] = useState(false);
  const [pendingCancelReturnId, setPendingCancelReturnId] = useState<string | null>(null);
  const [isCancellingReturn, setIsCancellingReturn] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isReturnDrawerOpen, setIsReturnDrawerOpen] = useState(false);
  const [reviewProduct, setReviewProduct] = useState<ReviewProduct | null>(null);
  const [orderReviews, setOrderReviews] = useState<Review[]>([]);
  const [isLoadingOrderReviews, setIsLoadingOrderReviews] = useState(false);
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const pageOrderCode = order?.code || order?.id || id || '';

  const loadReturnRequests = useCallback(
    async (orderId: string) => {
      try {
        const data = await returnService.getByOrderId(orderId);
        setReturnRequests(data);
      } catch (error) {
        console.error('Error fetching return requests:', error);
      }
    },
    []
  );
  usePageTitle(pageOrderCode ? `Đơn hàng #${toDisplayOrderCode(pageOrderCode)}` : 'Chi tiết đơn hàng');

  const handleCancelReturn = async (returnId: string) => {
    if (isCancellingReturn) return;
    setIsCancellingReturn(true);
    try {
      await returnService.cancelByCustomer(returnId, 'Khách hàng tự hủy yêu cầu');
      window.location.reload();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể hủy yêu cầu đổi/trả.';
      addToast(message, 'error');
    } finally {
      setIsCancellingReturn(false);
      setPendingCancelReturnId(null);
    }
  };

  const loadOrderReviews = useCallback(
    async (orderId: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      try {
        setIsLoadingOrderReviews(true);
        const rows = await reviewService.getReviewsByOrder(orderId);
        setOrderReviews(rows);
      } catch (error: unknown) {
        if (!silent) {
          const message = error instanceof Error ? error.message : 'Không thể tải danh sách đánh giá của đơn hàng.';
          addToast(message, 'error');
        }
      } finally {
        setIsLoadingOrderReviews(false);
      }
    },
    [addToast],
  );

  useEffect(() => {
    let mounted = true;

    const loadOrder = async (options?: { silent?: boolean; withLoading?: boolean }) => {
      const silent = options?.silent ?? false;
      const withLoading = options?.withLoading ?? false;
      try {
        if (withLoading) {
          setIsLoading(true);
        }
        if (!id) {
          if (mounted) setOrder(null);
          return;
        }
        const data = await orderService.getByIdFromBackend(id);
        if (!mounted) return;
        setOrder(data);
      } catch (error: unknown) {
        if (!mounted) return;
        if (!silent) {
          setOrder(null);
          const message = error instanceof Error ? error.message : 'Không thể tải chi tiết đơn hàng.';
          addToast(message, 'error');
        }
      } finally {
        if (withLoading && mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadOrder({ withLoading: true });
    if (id) {
      void loadReturnRequests(id);
    }

    const refreshInterval = window.setInterval(() => {
      if (!mounted || !id || document.visibilityState !== 'visible') {
        return;
      }
      void loadOrder({ silent: true });
    }, 15000);

    const handleWindowFocus = () => {
      if (!mounted || !id) {
        return;
      }
      void loadOrder({ silent: true });
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      mounted = false;
      window.removeEventListener('focus', handleWindowFocus);
      window.clearInterval(refreshInterval);
    };
  }, [addToast, id]);

  useEffect(() => {
    if (!order || !id) return;
    const routeKey = resolveDetailRouteKey(order.code, order.id);
    if (routeKey && routeKey !== id) {
      navigate(`/profile/orders/${encodeURIComponent(routeKey)}`, { replace: true });
    }
  }, [order, id, navigate]);

  const handleCancelOrder = async () => {
    if (!order) return;
    const finalReason = selectedReason === 'Lý do khác' ? otherReason : selectedReason;
    if (!finalReason) {
      addToast('Vui lòng chọn hoặc nhập lý do hủy đơn', 'error');
      return;
    }
    try {
      const updated = await orderService.cancelOnBackend(order.id, finalReason);
      if (updated) {
        setOrder(updated);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể hủy đơn hàng.';
      addToast(message, 'error');
      return;
    }
    addToast('Đã hủy đơn hàng thành công!', 'success');
    setIsCancelModalOpen(false);
    setTimeout(() => navigate('/profile'), 1500);
  };

  const handleCopyTracking = () => {
    if (order?.tracking) {
      navigator.clipboard.writeText(order.tracking);
      addToast('Đã sao chép mã vận đơn!', 'success');
    }
  };

  const handleReviewOrder = async () => {
    if (!order || order.status !== 'delivered' || isResolvingReview) return;

    try {
      setIsResolvingReview(true);
      const eligibleItems = await reviewService.getEligibleReviews();
      const orderEligibleItems = eligibleItems.filter((item) => item.orderId === order.id);

      if (orderEligibleItems.length === 0) {
        addToast('Đơn hàng này đã đánh giá hết hoặc chưa đủ điều kiện đánh giá.', 'info');
        return;
      }

      setReviewProduct(mapEligibleToReviewProduct(orderEligibleItems[0]));
      setIsReviewModalOpen(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể tải dữ liệu đánh giá.';
      addToast(message, 'error');
    } finally {
      setIsResolvingReview(false);
    }
  };

  const handleCloseReviewModal = () => {
    setIsReviewModalOpen(false);
    setReviewProduct(null);
    if (order?.id) {
      void loadOrderReviews(order.id, { silent: true });
    }
  };

  useEffect(() => {
    if (!order?.id || order.status !== 'delivered') {
      setOrderReviews([]);
      return;
    }
    void loadOrderReviews(order.id, { silent: true });
  }, [loadOrderReviews, order?.id, order?.status]);

  if (isLoading) {
    return (
      <div className="od-page od-theme od-theme-client">
        <div className="od-container">
          <div className="od-not-found">
            <h2>Đang tải đơn hàng...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="od-page od-theme od-theme-client">
        <div className="od-container">
          <div className="od-not-found">
            <Package size={64} strokeWidth={1} />
            <h2>Không tìm thấy đơn hàng</h2>
            <p>Đơn hàng #{id} không tồn tại hoặc đã bị xoá.</p>
            <Link to="/profile?tab=orders" className="od-back-link">Quay lại lịch sử đơn hàng</Link>
          </div>
        </div>
      </div>
    );
  }

  const addressParts = order.addressSummary.split(',');
  const shippingName = addressParts[0]?.trim() || '';
  const shippingPhone = addressParts[1]?.trim() || '';
  const shippingAddress = addressParts.slice(2).join(',').trim() || '';
  const totalProductQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const slaNotice = getOrderSlaNotice(order);
  return (
    <div className="od-page od-theme od-theme-client">
      <div className="od-container">
        <div className="od-breadcrumb">
          <Link to="/">Trang chủ</Link>
          <ChevronRight size={14} />
          <Link to="/profile">Tài khoản</Link>
        </div>

        <div className="od-header">
          <Link to="/profile?tab=orders" className="od-back-btn">
            <ArrowLeft size={18} /> Quay lại
          </Link>
          <div className="od-header-info">
            <h1>Đơn hàng <span className="od-order-id">#{order.code || order.id}</span></h1>
          </div>
          {(() => {
            const activeReturn = returnRequests.find((req) => req.status !== 'CANCELLED');
            if (activeReturn) {
              const getReturnStatusBadgeLabel = (status: string) => {
                switch (status) {
                  case 'REQUESTED':
                    return 'Đã yêu cầu';
                  case 'IN_TRANSIT':
                    return 'Đang vận chuyển';
                  case 'DELIVERED_TO_SELLER':
                    return 'Shop đang xử lý';
                  case 'REFUND_SUCCESS':
                    return 'Trả hàng thành công';
                  case 'RETURN_REJECTED':
                    return 'Yêu cầu bị từ chối';
                  case 'DISPUTING':
                    return 'Tranh chấp';
                  case 'CANCELLED':
                    return 'Đã hủy';
                  default:
                    return 'Đang xử lý';
                }
              };
              const displayStatusClass = activeReturn.status === 'REFUND_SUCCESS' ? 'status-refunded' : 'status-returning';
              return (
                <span className={`od-status-badge ${displayStatusClass}`}>
                  {getReturnStatusBadgeLabel(activeReturn.status)}
                </span>
              );
            }
            return (
              <span className={`od-status-badge ${statusColorMap[order.status]}`}>{t.status[order.status]}</span>
            );
          })()}
        </div>

        {slaNotice ? (
          <div className={`od-sla-notice ${slaNotice.tone}`}>
            <Clock size={16} />
            <span>{slaNotice.text}</span>
          </div>
        ) : null}

        <div className="od-grid">
          <div className="od-left">
            <div className="od-card od-items-card">
              <h3 className="od-card-title">Trạng thái đơn hàng</h3>
              <div className="od-timeline">
                {order.statusSteps.map((step, idx) => (
                  <div key={idx} className="od-tl-step done">
                    <div className="od-tl-dot">
                      {step.label.includes('Đặt') ? <Clock size={16} />
                        : step.label.includes('Xác nhận') ? <CheckCircle2 size={16} />
                          : step.label.includes('giao') ? <Truck size={16} />
                            : step.label.includes('hủy') ? <XCircle size={16} />
                              : <Package size={16} />}
                    </div>
                    <div className="od-tl-content">
                      <span className="od-tl-label">{step.label}</span>
                      {step.timestamp && <span className="od-tl-time">{step.timestamp}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {order.tracking && (
                <div className="od-tracking">
                  <span className="od-tracking-label">Mã vận đơn:</span>
                  <code className="od-tracking-code">{order.tracking}</code>
                  <button className="od-tracking-copy" onClick={handleCopyTracking}><Copy size={14} /> Sao chép</button>
                </div>
              )}
            </div>

            <div className="od-card od-products-card">
              <h3 className="od-card-title">Sản phẩm ({order.items.length})</h3>
              <div className="od-items">
                {order.items.map((item, idx) => {
                  const lineTotal = item.price * item.quantity;
                  const productIdentifier = String(item.productSlug || item.productId || item.id || '').trim();
                  const productHref = productIdentifier ? `/product/${encodeURIComponent(productIdentifier)}` : '';

                  return (
                    <div key={idx} className="od-item">
                      {productHref ? (
                        <Link to={productHref} className="od-item-link" title="Xem chi tiết sản phẩm">
                          <img src={getOptimizedImageUrl(item.image, { width: 240, format: 'webp' })} alt={item.name} className="od-item-img" />
                          <div className="od-item-info">
                            <p className="od-item-name">{item.name}</p>
                            <div className="od-item-meta">
                              {item.color && <span className="od-item-meta-chip">Màu: {item.color}</span>}
                              {item.size && <span className="od-item-meta-chip">Size: {item.size}</span>}
                              <span className="od-item-meta-chip od-item-meta-chip-qty">SL: {item.quantity}</span>
                            </div>
                          </div>
                        </Link>
                      ) : (
                        <>
                          <img src={getOptimizedImageUrl(item.image, { width: 240, format: 'webp' })} alt={item.name} className="od-item-img" />
                          <div className="od-item-info">
                            <p className="od-item-name">{item.name}</p>
                            <div className="od-item-meta">
                              {item.color && <span className="od-item-meta-chip">Màu: {item.color}</span>}
                              {item.size && <span className="od-item-meta-chip">Size: {item.size}</span>}
                              <span className="od-item-meta-chip od-item-meta-chip-qty">SL: {item.quantity}</span>
                            </div>
                          </div>
                        </>
                      )}
                      <div className="od-item-pricing">
                        <span className="od-item-price-label">Đơn giá</span>
                        <span className="od-item-price">{formatPrice(item.price)}</span>
                        <span className="od-item-line-total">Thành tiền: {formatPrice(lineTotal)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="od-items-footer">
                <span>{order.items.length} sản phẩm, {totalProductQuantity} món</span>
                <span>Tạm tính: <strong>{formatPrice(order.total)}</strong></span>
              </div>
            </div>

            {order.status === 'delivered' ? (
              <div className="od-card od-reviews-card">
                <div className="od-reviews-head">
                  <h3 className="od-card-title od-reviews-title">Đánh giá của bạn</h3>
                  <span className="od-reviews-count">{orderReviews.length} đánh giá</span>
                </div>

                {isLoadingOrderReviews ? (
                  <div className="od-reviews-empty">Đang tải danh sách đánh giá...</div>
                ) : orderReviews.length === 0 ? (
                  <div className="od-reviews-empty">Bạn chưa đánh giá sản phẩm nào trong đơn hàng này.</div>
                ) : (
                  <div className="od-reviews-list">
                    {orderReviews.map((review) => {
                      const reviewRating = clampReviewRating(review.rating);
                      const reviewContent = review.content?.trim() || 'Bạn chưa thêm mô tả cho đánh giá này.';

                      return (
                        <article key={review.id} className="od-review-item">
                          <header className="od-review-head">
                            <div className="od-review-stars" aria-label={`${reviewRating} sao`}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <span
                                  key={`${review.id}-star-${star}`}
                                  className={`od-review-star ${star <= reviewRating ? 'active' : ''}`}
                                >
                                  ★
                                </span>
                              ))}
                            </div>
                            <span className="od-review-rating-chip">{reviewRating}/5</span>
                          </header>

                          <p className="od-review-content">{reviewContent}</p>

                          {review.images && review.images.length > 0 ? (
                            <div className="od-review-images">
                              {review.images.map((imageUrl, index) => (
                                <img
                                  key={`${review.id}-image-${index}`}
                                  src={getOptimizedImageUrl(imageUrl, { width: 220, format: 'webp' })}
                                  alt={`Ảnh đánh giá ${index + 1}`}
                                  className="od-review-image"
                                  loading="lazy"
                                />
                              ))}
                            </div>
                          ) : null}

                          {review.shopReply ? (
                            <div className="od-review-reply">
                              <p className="od-review-reply-label">Phản hồi từ shop</p>
                              <p className="od-review-reply-content">{review.shopReply.content}</p>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="od-right">
            <div className="od-card">
              <h3 className="od-card-title"><MapPin size={16} /> Thông tin giao hàng</h3>
              <div className="od-info-block">
                <p className="od-info-name">{shippingName}</p>
                <p className="od-info-phone"><Phone size={14} /> {shippingPhone}</p>
                <p className="od-info-address">{shippingAddress}</p>
              </div>
            </div>

            <div className="od-card">
              <h3 className="od-card-title"><CreditCard size={16} /> Phương thức thanh toán</h3>
              <p className="od-payment-method">{order.paymentMethod}</p>
            </div>

            <div className="od-card">
              <h3 className="od-card-title">Chi tiết thanh toán</h3>
              <div className="od-summary">
                <div className="od-sum-row">
                  <span>Tạm tính</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="od-sum-row">
                  <span>Phí vận chuyển</span>
                  <span>{order.shippingFee && order.shippingFee > 0 ? formatPrice(order.shippingFee) : 'Miễn phí'}</span>
                </div>
                {order.discount && order.discount > 0 ? (
                  <div className="od-sum-row od-discount">
                    <span>Voucher giảm giá</span>
                    <span>-{formatPrice(order.discount)}</span>
                  </div>
                ) : null}
                {order.cancelReason && (
                  <div className="od-sum-row">
                    <span>Trạng thái</span>
                    <span>Đã hủy: {order.cancelReason}</span>
                  </div>
                )}
                <div className="od-sum-row od-total-row">
                  <span>Tổng cộng</span>
                  <span className="od-total-price">{formatPrice(order.total)}</span>
                </div>
              </div>
            </div>

            <div className="od-card od-actions-card">
              {order.status === 'delivered' && (
                <>
                  {!isLoadingOrderReviews && orderReviews.length === 0 ? (
                    <button
                      className="od-action-btn od-btn-primary"
                      onClick={() => void handleReviewOrder()}
                      disabled={isResolvingReview}
                    >
                      {isResolvingReview ? 'Đang tải...' : 'Đánh giá sản phẩm'}
                    </button>
                  ) : null}
                  {(() => {
                    const activeReq = returnRequests.find((req) => req.status !== 'CANCELLED');
                    if (activeReq) {
                      if (activeReq.status === 'REQUESTED' || activeReq.status === 'IN_TRANSIT') {
                        return (
                          <button className="od-action-btn od-btn-danger" onClick={() => setPendingCancelReturnId(activeReq.id)}>
                            Hủy yêu cầu
                          </button>
                        );
                      }
                      const getReturnStatusLabel = (req: ReturnRequest) => {
                        switch (req.status) {
                          case 'REQUESTED':
                            return 'Đang yêu cầu';
                          case 'IN_TRANSIT':
                            return 'Đang vận chuyển';
                          case 'DELIVERED_TO_SELLER':
                            return 'Shop đã nhận';
                          case 'REFUND_SUCCESS':
                            return 'Hoàn thành';
                          case 'RETURN_REJECTED':
                            return 'Bị từ chối';
                          case 'DISPUTING':
                            return 'Tranh chấp';
                          case 'CANCELLED':
                            return 'Đã hủy';
                          default:
                            return 'Đang xử lý';
                        }
                      };
                      return (
                        <button className="od-action-btn od-btn-outline" disabled>
                          <RotateCcw size={16} /> Đã yêu cầu ({getReturnStatusLabel(activeReq)})
                        </button>
                      );
                    }
                    return (
                      <button className="od-action-btn od-btn-outline" onClick={() => setIsReturnDrawerOpen(true)}>
                        <RotateCcw size={16} /> Hoàn đơn
                      </button>
                    );
                  })()}
                </>
              )}
              {order.status === 'shipping' && (
                <button className="od-action-btn od-btn-primary">Xác nhận đã nhận hàng</button>
              )}
              {(order.status === 'pending' || order.status === 'processing') && (
                <>
                  <button
                    className="od-action-btn od-btn-danger"
                    onClick={() => setIsCancelModalOpen(true)}
                  >
                    <XCircle size={16} /> Hủy đơn hàng
                  </button>
                </>
              )}
              {order.status === 'cancelled' && (
                <button className="od-action-btn od-btn-primary">Mua lại</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {isCancelModalOpen && (
        <div className="od-modal-overlay">
          <div className="od-cancel-modal">
            <button className="od-modal-close" onClick={() => setIsCancelModalOpen(false)}>
              <X size={20} />
            </button>
            <div className="od-modal-icon">
              <AlertTriangle size={32} />
            </div>
            <h3 className="od-modal-title">Xác nhận hủy đơn hàng</h3>
            <p className="od-modal-desc">
              Bạn có chắc chắn muốn hủy đơn hàng <strong>#{order.code || order.id}</strong>?
              Hành động này không thể hoàn tác.
            </p>

            <div className="od-cancel-reasons">
              <p className="od-reason-label">Lý do hủy đơn:</p>
              {CANCEL_REASONS.map((reason) => (
                <label key={reason} className="od-reason-option">
                  <input
                    type="radio"
                    name="cancelReason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={(e) => setSelectedReason(e.target.value)}
                  />
                  <span className="od-reason-text">{reason}</span>
                </label>
              ))}
            </div>

            {selectedReason === 'Lý do khác' && (
              <textarea
                className="od-reason-input"
                placeholder="Nhập lý do của bạn..."
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                rows={3}
              />
            )}

            <div className="od-modal-actions">
              <button
                className="od-btn-cancel-action"
                onClick={() => setIsCancelModalOpen(false)}
              >
                Không, giữ đơn
              </button>
              <button
                className="od-btn-confirm-cancel"
                onClick={handleCancelOrder}
              >
                Xác nhận hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewProduct ? (
        <ReviewModal
          isOpen={isReviewModalOpen}
          onClose={handleCloseReviewModal}
          product={reviewProduct}
        />
      ) : null}

      <ReturnRequestDrawer
        isOpen={isReturnDrawerOpen}
        order={order}
        onClose={() => {
          setIsReturnDrawerOpen(false);
          if (id) {
            void loadReturnRequests(id);
          }
        }}
      />

      {/* Confirm Cancel Return Modal */}
      <ConfirmModal
        isOpen={Boolean(pendingCancelReturnId)}
        onClose={() => setPendingCancelReturnId(null)}
        onConfirm={() => pendingCancelReturnId && void handleCancelReturn(pendingCancelReturnId)}
        title="Hủy yêu cầu đổi/trả"
        message="Bạn có chắc chắn muốn hủy yêu cầu đổi/trả này? Sau khi hủy, yêu cầu sẽ không thể khôi phục."
        confirmText="Hủy yêu cầu"
        cancelText="Giữ yêu cầu"
        variant="danger"
        isLoading={isCancellingReturn}
      />
    </div>
  );
};

export default OrderDetail;
