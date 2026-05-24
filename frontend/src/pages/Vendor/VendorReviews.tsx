import './Vendor.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, MessageSquare, Star } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import VendorLayout from './VendorLayout';
import {
  PanelDrawerFooter,
  PanelDrawerHeader,
  PanelDrawerSection,
  PanelFilterSelect,
  PanelSearchField,
  PanelStatsGrid,
  PanelTableFooter,
} from '../../components/Panel/PanelPrimitives';
import {
  reviewService,
  type Review,
  type VendorReviewSummary,
  type VendorReviewsPage,
} from '../../services/reviewService';
import { useToast } from '../../contexts/ToastContext';
import { AdminStateBlock } from '../Admin/AdminStateBlocks';
import AdminConfirmDialog from '../Admin/AdminConfirmDialog';
import Drawer from '../../components/Drawer/Drawer';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { toDisplayOrderCode } from '../../utils/displayCode';
import { normalizePositiveInteger } from './vendorHelpers';

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'need_reply', label: 'Cần phản hồi' },
  { key: 'negative', label: 'Tiêu cực' },
] as const;

type ReviewQueueFilter = typeof TABS[number]['key'];
type ReviewModerationFilter = Review['status'] | 'all';

const MODERATION_FILTERS: Array<{ key: ReviewModerationFilter; label: string }> = [
  { key: 'all', label: 'Tất cả hiển thị' },
  { key: 'approved', label: 'Đang hiển thị' },
  { key: 'hidden', label: 'Đã ẩn' },
  { key: 'pending', label: 'Chờ duyệt' },
];

const normalizeQueueFilter = (value: string | null): ReviewQueueFilter => {
  if (value === 'need_reply' || value === 'negative') {
    return value;
  }

  return 'all';
};

const normalizeModerationFilter = (value: string | null): ReviewModerationFilter => {
  if (value === 'approved' || value === 'hidden' || value === 'pending') {
    return value;
  }

  return 'all';
};

const PAGE_SIZE = 12;

const emptyReviewsPage: VendorReviewsPage = {
  items: [],
  totalElements: 0,
  totalPages: 1,
  page: 1,
};

const emptyReviewSummary: VendorReviewSummary = {
  total: 0,
  needReply: 0,
  negative: 0,
  average: 0,
};

const RatingStars = ({ rating }: { rating: number }) => (
  <div className="vendor-rating-stars">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        size={14}
        style={{
          color: star <= rating ? '#facc15' : '#d1d5db',
          fill: star <= rating ? '#facc15' : 'none',
        }}
      />
    ))}
  </div>
);

const formatDateTime = (value?: string) => {
  if (!value) return 'Chưa có dữ liệu';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('vi-VN', {
    hour12: false,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getModerationTone = (status?: Review['status']) => {
  if (status === 'approved') return 'success';
  if (status === 'hidden') return 'neutral';
  return 'pending';
};

const getModerationLabel = (status?: Review['status']) => {
  if (status === 'approved') return 'Đã duyệt';
  if (status === 'hidden') return 'Đã ẩn';
  return 'Chờ duyệt';
};

const VendorReviews = () => {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = normalizeQueueFilter(searchParams.get('status'));
  const moderationFilter = normalizeModerationFilter(searchParams.get('moderation'));
  const page = normalizePositiveInteger(searchParams.get('page'));
  const keyword = (searchParams.get('q') || '').trim();

  const [searchQuery, setSearchQuery] = useState(keyword);
  const [reviewsPage, setReviewsPage] = useState<VendorReviewsPage>(emptyReviewsPage);
  const [summary, setSummary] = useState<VendorReviewSummary>(emptyReviewSummary);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeReview, setActiveReview] = useState<Review | null>(null);
  const [confirmReplyIds, setConfirmReplyIds] = useState<string[] | null>(null);

  const handleCloseDrawer = useCallback(() => {
    setActiveReview(null);
  }, []);
  const [replyingIds, setReplyingIds] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const latestReviewsRequestIdRef = useRef(0);
  const canVendorReply = reviewService.canVendorReply();

  const updateQuery = useCallback(
    (mutate: (query: URLSearchParams) => void, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback((nextPage: number) => {
    updateQuery((query) => {
      query.set('page', String(Math.max(1, nextPage)));
    });
  }, [updateQuery]);

  const setQueueFilter = useCallback((filter: ReviewQueueFilter) => {
    setSelected(new Set());
    updateQuery((query) => {
      if (filter === 'all') {
        query.delete('status');
      } else {
        query.set('status', filter);
      }
      query.set('page', '1');
    });
  }, [updateQuery]);

  const setModerationFilter = useCallback((filter: ReviewModerationFilter) => {
    setSelected(new Set());
    updateQuery((query) => {
      if (filter === 'all') {
        query.delete('moderation');
      } else {
        query.set('moderation', filter);
      }
      query.set('page', '1');
    });
  }, [updateQuery]);

  useEffect(() => {
    setSearchQuery(keyword);
  }, [keyword]);

  useEffect(() => {
    if (searchQuery.trim() === keyword) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSelected(new Set());
      updateQuery(
        (query) => {
          const normalized = searchQuery.trim();
          if (normalized) {
            query.set('q', normalized);
          } else {
            query.delete('q');
          }
          query.set('page', '1');
        },
        true,
      );
    }, 280);

    return () => window.clearTimeout(timer);
  }, [keyword, searchQuery, updateQuery]);

  const tabFilters = useMemo(() => {
    if (activeTab === 'need_reply') return { needReply: true as const };
    if (activeTab === 'negative') return { maxRating: 3 as const };
    return {};
  }, [activeTab]);

  const fetchSummary = useCallback(async () => {
    try {
      const next = await reviewService.getVendorReviewSummary();
      setSummary(next);
    } catch {
      // Keep current summary on summary request failure.
    }
  }, []);

  const fetchReviews = useCallback(async () => {
    const requestId = ++latestReviewsRequestIdRef.current;

    try {
      setLoading(true);
      setLoadError(null);

      const next = await reviewService.getVendorReviews({
        page,
        size: PAGE_SIZE,
        q: keyword || undefined,
        status: moderationFilter,
        ...tabFilters,
      });

      if (requestId !== latestReviewsRequestIdRef.current) return;

      setReviewsPage(next);
      setSelected((prev) => {
        if (prev.size === 0) return prev;
        const visibleIds = new Set(next.items.map((item) => item.id));
        return new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      });

      if (page > next.totalPages) {
        setPage(next.totalPages);
      }
    } catch (err: unknown) {
      if (requestId !== latestReviewsRequestIdRef.current) return;
      setReviewsPage(emptyReviewsPage);
      setLoadError(getUiErrorMessage(err, 'Không tải được đánh giá của cửa hàng.'));
    } finally {
      if (requestId === latestReviewsRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [keyword, moderationFilter, page, setPage, tabFilters]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary, reloadKey]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews, reloadKey]);

  const reviews = reviewsPage.items;

  useEffect(() => {
    if (!activeReview) return;
    const refreshed = reviews.find((review) => review.id === activeReview.id);
    if (refreshed) {
      setActiveReview(refreshed);
    }
  }, [activeReview, reviews]);

  const safePage = Math.min(page, reviewsPage.totalPages);
  const startIndex = reviewsPage.totalElements === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(reviewsPage.totalElements, safePage * PAGE_SIZE);

  const resetCurrentView = () => {
    setSearchQuery('');
    setSelected(new Set());
    setSearchParams(new URLSearchParams());
  };

  const submitReplies = async (ids: string[]) => {
    if (!canVendorReply) {
      addToast('Phiên đăng nhập hiện tại không hỗ trợ phản hồi đánh giá.', 'info');
      return;
    }

    const targets = ids.filter((id) => {
      const content = (replyDrafts[id] || '').trim();
      const review = reviews.find((item) => item.id === id) || (activeReview?.id === id ? activeReview : null);
      return Boolean(content) && Boolean(review) && !review?.shopReply;
    });

    if (targets.length === 0) {
      addToast('Hãy nhập nội dung phản hồi trước khi gửi.', 'info');
      return;
    }

    setReplyingIds((current) => {
      const next = new Set(current);
      targets.forEach((id) => next.add(id));
      return next;
    });

    try {
      await Promise.all(
        targets.map(async (id) => {
          const content = (replyDrafts[id] || '').trim();
          await reviewService.replyAsVendor(id, content);
        }),
      );
      setReplyDrafts((current) => {
        const next = { ...current };
        targets.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      setActiveReview(null);
      setConfirmReplyIds(null);
      setSelected(new Set());
      addToast(
        targets.length > 1
          ? `Đã gửi phản hồi cho ${targets.length} đánh giá.`
          : 'Đã gửi phản hồi cho đánh giá.',
        'success',
      );
      await Promise.all([fetchReviews(), fetchSummary()]);
    } catch (err: unknown) {
      addToast(getUiErrorMessage(err, 'Không thể gửi phản hồi đánh giá.'), 'error');
    } finally {
      setReplyingIds((current) => {
        const next = new Set(current);
        targets.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const selectedNeedReply = useMemo(() => {
    return Array.from(selected).filter((id) => {
      if (!canVendorReply) return false;
      const current = reviews.find((review) => review.id === id);
      return Boolean(current && !current.shopReply && (replyDrafts[id] || '').trim());
    });
  }, [canVendorReply, replyDrafts, reviews, selected]);

  const selectedReplyLabels = useMemo(() => {
    return selectedNeedReply
      .map((id) => {
        const review = reviews.find((item) => item.id === id);
        if (!review) return null;
        return `${review.productName} - #${toDisplayOrderCode(review.orderCode)}`;
      })
      .filter((label): label is string => Boolean(label));
  }, [reviews, selectedNeedReply]);

  const statItems = [
    {
      key: 'all',
      label: 'Tổng đánh giá',
      value: summary.total,
      sub: `Điểm trung bình: ${summary.average.toFixed(1)}`,
      onClick: () => setQueueFilter('all'),
    },
    {
      key: 'need_reply',
      label: 'Cần phản hồi',
      value: summary.needReply,
      sub: 'Đánh giá chưa có phản hồi từ shop',
      tone: 'warning',
      onClick: () => setQueueFilter('need_reply'),
    },
    {
      key: 'negative',
      label: 'Đánh giá <= 3 sao',
      value: summary.negative,
      sub: 'Tín hiệu cần chăm sóc ưu tiên',
      tone: 'info',
      onClick: () => setQueueFilter('negative'),
    },
    {
      key: 'reply_rate',
      label: 'Tỷ lệ phản hồi',
      value: summary.total ? `${Math.round(((summary.total - summary.needReply) / summary.total) * 100)}%` : '0%',
      sub: 'Tỷ lệ đánh giá đã được shop chăm sóc',
      tone: 'success',
      onClick: () => setQueueFilter('all'),
    },
  ] as const;

  const tabCountMap = {
    all: summary.total,
    need_reply: summary.needReply,
    negative: summary.negative,
  };

  const tabItems = TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: tabCountMap[tab.key],
  }));
  const moderationItems = MODERATION_FILTERS;
  const hasViewContext = activeTab !== 'all' || moderationFilter !== 'all' || Boolean(keyword);

  return (
    <VendorLayout
      title="Đánh giá, phản hồi và uy tín shop"
      breadcrumbs={['Kênh Người Bán', 'Đánh giá và phản hồi']}
    >
      <PanelStatsGrid items={[...statItems]} accentClassName="vendor-stat-button" />

      <div className="admin-filter-toolbar vendor-filter-toolbar">
        <PanelSearchField
          placeholder="Tìm theo sản phẩm, nội dung, mã đơn..."
          ariaLabel="Tìm đánh giá shop"
          value={searchQuery}
          onChange={setSearchQuery}
        />
        <PanelFilterSelect
          label="Phản hồi"
          ariaLabel="Lọc đánh giá theo phản hồi"
          items={tabItems}
          value={activeTab}
          onChange={(key) => setQueueFilter(key as ReviewQueueFilter)}
        />
        <PanelFilterSelect
          label="Hiển thị"
          ariaLabel="Lọc đánh giá theo trạng thái hiển thị"
          items={moderationItems}
          value={moderationFilter}
          onChange={(key) => setModerationFilter(key as ReviewModerationFilter)}
        />
        {hasViewContext ? (
          <button type="button" className="admin-filter-reset" onClick={resetCurrentView}>
            Đặt lại
          </button>
        ) : null}
      </div>
      <section className="admin-panels single">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>Danh sách đánh giá</h2>
              {!canVendorReply ? (
                <p className="admin-muted small">Bạn cần đăng nhập bằng tài khoản người bán để phản hồi đánh giá.</p>
              ) : null}
            </div>
            <div className="vendor-reviews-head-actions">
              {canVendorReply ? (
                <button
                  className="admin-ghost-btn"
                  type="button"
                  disabled={selectedNeedReply.length === 0}
                  onClick={() => setConfirmReplyIds(selectedNeedReply)}
                >
                  <MessageSquare size={14} />
                  Phản hồi đã chọn
                </button>
              ) : null}
            </div>
          </div>
          {loading ? (
            <AdminStateBlock
              type="empty"
              title="Đang tải danh sách đánh giá"
              description="Hệ thống đang đồng bộ dữ liệu phản hồi của gian hàng."
            />
          ) : loadError ? (
            <AdminStateBlock
              type="empty"
              title="Không tải được đánh giá"
              description={loadError}
              actionLabel="Thử lại"
              onAction={() => setReloadKey((key) => key + 1)}
            />
          ) : reviews.length === 0 ? (
            <AdminStateBlock
              type={hasViewContext ? 'search-empty' : 'empty'}
              title={hasViewContext ? 'Không có đánh giá phù hợp' : 'Chưa có đánh giá cần xử lý'}
              description={
                hasViewContext
                  ? 'Thử đổi từ khóa hoặc tab để xem lại hàng đợi phản hồi của shop.'
                  : 'Khi khách để lại đánh giá, kênh người bán sẽ hiển thị tại đây.'
              }
              actionLabel={hasViewContext ? 'Đặt lại bộ lọc' : undefined}
              onAction={hasViewContext ? resetCurrentView : undefined}
            />
          ) : (
            <>
              <div className="admin-table" role="table" aria-label="Bảng đánh giá của shop">
                <div className="admin-table-row vendor-reviews admin-table-head" role="row">
                  <div role="columnheader">
                    <input
                      type="checkbox"
                      checked={selected.size === reviews.length && reviews.length > 0}
                      onChange={(event) => setSelected(event.target.checked ? new Set(reviews.map((item) => item.id)) : new Set())}
                    />
                  </div>
                  <div role="columnheader">STT</div>
                  <div role="columnheader">Sản phẩm</div>
                  <div role="columnheader">Đánh giá</div>
                  <div role="columnheader">Nội dung</div>
                  <div role="columnheader">Thời gian</div>
                  <div role="columnheader">Trạng thái</div>
                  <div role="columnheader">Phản hồi</div>
                  <div role="columnheader">Hành động</div>
                </div>

                {reviews.map((review, index) => (
                  <motion.div
                    key={review.id}
                    className="admin-table-row vendor-reviews"
                    role="row"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.025, 0.14) }}
                    whileHover={{ y: -1 }}
                    onClick={() => setActiveReview(review)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div role="cell" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(review.id)}
                        onChange={(event) => {
                          const next = new Set(selected);
                          if (event.target.checked) next.add(review.id);
                          else next.delete(review.id);
                          setSelected(next);
                        }}
                      />
                    </div>
                    <div role="cell" className="admin-mono">{startIndex + index}</div>
                    <div role="cell" className="vendor-admin-product-cell">
                      <img src={review.productImage} alt={review.productName} className="vendor-admin-thumb" />
                      <div className="vendor-admin-product-copy">
                        <div className="admin-bold">{review.productName}</div>
                        <div className="admin-muted small">Đơn #{toDisplayOrderCode(review.orderCode)}</div>
                      </div>
                    </div>
                    <div role="cell">
                      <RatingStars rating={review.rating} />
                    </div>
                    <div role="cell" className="vendor-review-content">{review.content}</div>
                    <div role="cell" className="admin-muted small">{formatDateTime(review.createdAt)}</div>
                    <div role="cell">
                      <span className={`admin-pill ${review.rating <= 3 ? 'pending' : 'success'}`}>
                        {review.rating <= 3 ? 'Cần chăm sóc' : 'Ổn định'}
                      </span>
                    </div>
                    <div role="cell">
                      {review.shopReply ? (
                        <div className="vendor-reply-badge">
                          <span className="admin-bold">Đã phản hồi</span>
                        </div>
                      ) : (
                        <span className="badge amber">Chưa phản hồi</span>
                      )}
                    </div>
                    <div role="cell" className="admin-actions" onClick={(event) => event.stopPropagation()}>
                      <button
                        className="admin-icon-btn subtle"
                        onClick={() => setActiveReview(review)}
                        aria-label="Xem chi tiết đánh giá"
                        title="Xem chi tiết đánh giá"
                      >
                        <Eye size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>

              <PanelTableFooter
                page={safePage}
                totalPages={reviewsPage.totalPages}
                onPageChange={setPage}
                meta={`Hiển thị ${startIndex}-${endIndex} / ${reviewsPage.totalElements} đánh giá`}
              />
            </>
          )}
        </div>
      </section>

      <AdminConfirmDialog
        open={Boolean(confirmReplyIds?.length)}
        title="Gửi phản hồi cho các đánh giá đã chọn"
        description="Các đánh giá này sẽ nhận phản hồi từ shop ngay sau khi xác nhận."
        selectedItems={selectedReplyLabels}
        selectedNoun="đánh giá"
        confirmLabel="Gửi phản hồi"
        variant="vendor"
        onCancel={() => setConfirmReplyIds(null)}
        onConfirm={() => void submitReplies(confirmReplyIds || [])}
      />

      <Drawer open={Boolean(activeReview)} onClose={handleCloseDrawer} className="vendor-drawer">
        {activeReview ? (
          <>
            <PanelDrawerHeader
              eyebrow="Chi tiết đánh giá"
              title={activeReview.productName}
              onClose={handleCloseDrawer}
              closeLabel="Đóng chi tiết đánh giá"
            />
            <div className="drawer-body">
              <PanelDrawerSection title="Tổng quan đánh giá">
                <div className="review-drawer-product">
                  <img
                    src={activeReview.productImage}
                    alt={activeReview.productName}
                    className="review-drawer-product-image"
                  />
                  <div className="review-drawer-product-copy">
                    <p className="review-drawer-product-name">{activeReview.productName}</p>
                    <p className="review-drawer-product-sub">Đơn hàng: #{toDisplayOrderCode(activeReview.orderCode)}</p>
                    <div className="review-drawer-pill-row">
                      <span className={`admin-pill ${getModerationTone(activeReview.status)}`}>
                        {getModerationLabel(activeReview.status)}
                      </span>
                      <span className={`admin-pill ${activeReview.rating <= 3 ? 'pending' : 'success'}`}>
                        {activeReview.rating <= 3 ? 'Cần chăm sóc' : 'Ổn định'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="review-drawer-meta-grid">
                  <div className="review-drawer-meta-card">
                    <span className="review-drawer-meta-label">Điểm đánh giá</span>
                    <span className="review-drawer-meta-value">
                      <RatingStars rating={activeReview.rating} /> <strong>{activeReview.rating}/5</strong>
                    </span>
                  </div>
                  <div className="review-drawer-meta-card">
                    <span className="review-drawer-meta-label">Thời gian tạo</span>
                    <span className="review-drawer-meta-value">{formatDateTime(activeReview.createdAt)}</span>
                  </div>
                  <div className="review-drawer-meta-card">
                    <span className="review-drawer-meta-label">Cập nhật gần nhất</span>
                    <span className="review-drawer-meta-value">{formatDateTime(activeReview.updatedAt || activeReview.createdAt)}</span>
                  </div>
                  <div className="review-drawer-meta-card">
                    <span className="review-drawer-meta-label">Mã sản phẩm</span>
                    <span className="review-drawer-meta-value review-drawer-code">{activeReview.productSlug || activeReview.productId || 'Chưa có'}</span>
                  </div>
                </div>
              </PanelDrawerSection>

              <PanelDrawerSection title="Nội dung khách hàng">
                <p className="review-drawer-content">{activeReview.content || 'Khách hàng chưa để lại nội dung.'}</p>
              </PanelDrawerSection>

              <PanelDrawerSection title="Ảnh đính kèm">
                {activeReview.images && activeReview.images.length > 0 ? (
                  <div className="review-drawer-media-grid">
                    {activeReview.images.map((image, index) => (
                      <a
                        key={`${activeReview.id}-${index}`}
                        href={image}
                        target="_blank"
                        rel="noreferrer"
                        className="review-drawer-media-item"
                      >
                        <img src={image} alt={`Review media ${index + 1}`} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="review-drawer-empty">Khách hàng chưa đính kèm hình ảnh.</p>
                )}
              </PanelDrawerSection>

              <PanelDrawerSection title="Phản hồi của shop">
                {activeReview.shopReply ? (
                  <div className="review-drawer-reply-box">
                    <p className="review-drawer-reply-title">Đã phản hồi</p>
                    <p>{activeReview.shopReply.content}</p>
                    <span className="review-drawer-reply-time">{formatDateTime(activeReview.shopReply.createdAt)}</span>
                  </div>
                ) : canVendorReply ? (
                  <div className="form-grid">
                    <label className="form-field full">
                      <span>Nội dung phản hồi</span>
                      <textarea
                        rows={4}
                        value={replyDrafts[activeReview.id] || ''}
                        onChange={(event) =>
                          setReplyDrafts((current) => ({ ...current, [activeReview.id]: event.target.value }))
                        }
                        placeholder="Giải thích, xin lỗi hoặc hướng dẫn khách hàng..."
                      />
                    </label>
                  </div>
                ) : (
                  <div className="review-drawer-reply-box review-drawer-empty">
                    Bạn cần đăng nhập tài khoản người bán hợp lệ để gửi phản hồi đánh giá này.
                  </div>
                )}
              </PanelDrawerSection>
            </div>
            <PanelDrawerFooter>
              <button className="admin-ghost-btn" type="button" onClick={handleCloseDrawer}>Đóng</button>
              {!activeReview.shopReply && canVendorReply ? (
                <button
                  className="admin-primary-btn vendor-admin-primary"
                  onClick={() => void submitReplies([activeReview.id])}
                  disabled={replyingIds.has(activeReview.id)}
                >
                  <MessageSquare size={15} />
                  {replyingIds.has(activeReview.id) ? 'Đang gửi...' : 'Gửi phản hồi'}
                </button>
              ) : null}
            </PanelDrawerFooter>
          </>
        ) : null}
      </Drawer>
    </VendorLayout>
  );
};

export default VendorReviews;
