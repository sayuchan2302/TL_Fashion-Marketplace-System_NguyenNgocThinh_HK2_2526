import { Link } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { MessageSquare, Star } from 'lucide-react';
import EmptyState from '../../../../components/EmptyState/EmptyState';
import ProfilePagination from '../ProfilePagination';
import type { ProfileTabContentProps } from '../ProfileTabContent.types';

const ReviewsTab = ({
  reviewFilter,
  onReviewFilterChange,
  pendingReviews,
  completedReviews,
  reviewsLoading,
  reviewsError,
  pendingReviewPage,
  completedReviewPage,
  reviewsPerPage,
  onPendingReviewPageChange,
  onCompletedReviewPageChange,
  getOrderDisplayCode,
  onOpenReviewModal,
}: Pick<ProfileTabContentProps,
  | 'reviewFilter'
  | 'onReviewFilterChange'
  | 'pendingReviews'
  | 'completedReviews'
  | 'reviewsLoading'
  | 'reviewsError'
  | 'pendingReviewPage'
  | 'completedReviewPage'
  | 'reviewsPerPage'
  | 'onPendingReviewPageChange'
  | 'onCompletedReviewPageChange'
  | 'getOrderDisplayCode'
  | 'onOpenReviewModal'
>) => {
  const totalPendingPages = Math.max(1, Math.ceil(pendingReviews.length / reviewsPerPage));
  const totalCompletedPages = Math.max(1, Math.ceil(completedReviews.length / reviewsPerPage));
  const safePendingPage = Math.min(pendingReviewPage, totalPendingPages);
  const safeCompletedPage = Math.min(completedReviewPage, totalCompletedPages);

  const pagedPendingReviews = useMemo(() => {
    const start = (safePendingPage - 1) * reviewsPerPage;
    return pendingReviews.slice(start, start + reviewsPerPage);
  }, [pendingReviews, reviewsPerPage, safePendingPage]);

  const pagedCompletedReviews = useMemo(() => {
    const start = (safeCompletedPage - 1) * reviewsPerPage;
    return completedReviews.slice(start, start + reviewsPerPage);
  }, [completedReviews, reviewsPerPage, safeCompletedPage]);

  useEffect(() => {
    if (reviewFilter === 'pending') {
      onPendingReviewPageChange(1);
    } else {
      onCompletedReviewPageChange(1);
    }
  }, [onCompletedReviewPageChange, onPendingReviewPageChange, reviewFilter]);

  useEffect(() => {
    if (pendingReviewPage > totalPendingPages) {
      onPendingReviewPageChange(totalPendingPages);
    }
  }, [onPendingReviewPageChange, pendingReviewPage, totalPendingPages]);

  useEffect(() => {
    if (completedReviewPage > totalCompletedPages) {
      onCompletedReviewPageChange(totalCompletedPages);
    }
  }, [completedReviewPage, onCompletedReviewPageChange, totalCompletedPages]);

  return (
    <div className="tab-pane">
      <div className="profile-content-header">
        <h2 className="profile-content-title">Đánh giá & Phản hồi</h2>
      </div>

      <div className="order-filter-tabs">
        <button className={`order-filter-btn ${reviewFilter === 'pending' ? 'active' : ''}`} onClick={() => onReviewFilterChange('pending')}>
          Chờ đánh giá ({pendingReviews.length})
        </button>
        <button className={`order-filter-btn ${reviewFilter === 'completed' ? 'active' : ''}`} onClick={() => onReviewFilterChange('completed')}>
          Đã đánh giá ({completedReviews.length})
        </button>
      </div>

      {reviewsLoading ? (
        <div className="review-empty">
          <p>Đang tải danh sách đánh giá...</p>
        </div>
      ) : null}

      {!reviewsLoading && reviewsError ? (
        <div className="review-empty-state">
          <EmptyState icon={<MessageSquare size={80} strokeWidth={1} />} title="Không thể tải đánh giá" description={reviewsError} />
        </div>
      ) : null}

      {reviewFilter === 'pending' && (
        <div className="review-section">
          {!reviewsLoading && !reviewsError && pendingReviews.length > 0 ? (
            <>
              <div className="review-pending-list">
                {pagedPendingReviews.map((product) => {
                  const parts = product.variant?.split(' | ') || [];
                  const variantName = parts[0] || '';
                  const qtyString = parts[1]?.replace('Số lượng: ', 'x') || 'x1';

                  return (
                    <div key={`${product.orderId}-${product.productId}-${product.variant || ''}`} className="order-card">
                      <div className="order-card-header">
                        <div className="order-card-meta">
                          <span className="order-id">Đơn hàng: #{getOrderDisplayCode(product.orderId, product.orderCode)}</span>
                        </div>
                        <span className="order-status-badge status-pending">
                          Chờ đánh giá
                        </span>
                      </div>

                      <div className="order-card-items">
                        <div className="order-item">
                          <Link to={`/product/${encodeURIComponent(product.productId)}`} className="order-item-img">
                            <img src={product.productImage} alt={product.productName} />
                          </Link>
                          <div className="order-item-info">
                            <h4 className="order-item-name">{product.productName}</h4>
                            {variantName && <p className="order-item-variant">Size: {variantName}</p>}
                            <p className="order-item-qty">{qtyString}</p>
                          </div>
                        </div>
                      </div>

                      <div className="order-card-footer">
                        <div className="order-total" />
                        <div className="order-actions">
                          <button className="order-action-btn order-btn-primary" onClick={() => onOpenReviewModal(product)}>
                            Viết đánh giá
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <ProfilePagination
                page={safePendingPage}
                totalItems={pendingReviews.length}
                totalPages={totalPendingPages}
                itemsPerPage={reviewsPerPage}
                itemLabel="sản phẩm"
                onPageChange={onPendingReviewPageChange}
              />
            </>
          ) : !reviewsLoading && !reviewsError ? (
            <div className="review-empty-state">
              <MessageSquare className="review-empty-icon" size={26} strokeWidth={1.8} />
              <p>Không có sản phẩm nào chờ đánh giá</p>
            </div>
          ) : null}
        </div>
      )}

      {reviewFilter === 'completed' && (
        <div className="review-section">
          {!reviewsLoading && !reviewsError && completedReviews.length > 0 ? (
            <>
              <div className="review-completed-list">
                {pagedCompletedReviews.map((review) => (
                  <div key={review.id} className="order-card">
                    <div className="order-card-header">
                      <div className="order-card-meta">
                        <span className="order-id">Đơn hàng: #{getOrderDisplayCode(review.orderId, review.orderCode)}</span>
                        <span className="order-date">{new Date(review.createdAt).toLocaleDateString('vi-VN')}</span>
                      </div>
                      <span className="order-status-badge status-delivered">
                        Đã đánh giá
                      </span>
                    </div>

                    <div className="order-card-items">
                      <div className="order-item" style={{ borderBottom: '1px solid var(--co-gray-100)', paddingBottom: '16px', marginBottom: '12px' }}>
                        <Link to={`/product/${encodeURIComponent(review.productId)}`} className="order-item-img">
                          <img
                            src={review.productImage || 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=80&h=80&fit=crop'}
                            alt={review.productName}
                          />
                        </Link>
                        <div className="order-item-info">
                          <h4 className="order-item-name">{review.productName}</h4>
                          {review.variantName && <p className="order-item-variant">Size: {review.variantName}</p>}
                          <div className="review-stars" style={{ marginTop: '6px', display: 'flex', gap: '3px' }}>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={16}
                                fill={i < review.rating ? '#f59e0b' : 'none'}
                                stroke={i < review.rating ? '#f59e0b' : '#d1d5db'}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="review-content-body" style={{ padding: '0 4px' }}>
                        <p className="review-text-label" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--co-gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                          Đánh giá của bạn
                        </p>
                        <p className="review-text" style={{ margin: '0 0 12px 0' }}>{review.content}</p>

                        {review.shopReply ? (
                          <div className="review-reply" style={{ marginTop: '12px' }}>
                            <div className="review-reply-header">
                              <span className="review-reply-badge">Phản hồi từ shop</span>
                            </div>
                            <p className="review-reply-text">{review.shopReply.content}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <ProfilePagination
                page={safeCompletedPage}
                totalItems={completedReviews.length}
                totalPages={totalCompletedPages}
                itemsPerPage={reviewsPerPage}
                itemLabel="đánh giá"
                onPageChange={onCompletedReviewPageChange}
              />
            </>
          ) : !reviewsLoading && !reviewsError ? (
            <div className="review-empty-state">
              <Star className="review-empty-icon" size={26} strokeWidth={1.8} />
              <p>Bạn chưa có đánh giá nào</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ReviewsTab;
