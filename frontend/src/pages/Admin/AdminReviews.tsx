import './Admin.css';
import { Eye, EyeOff, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import AdminLayout from './AdminLayout';
import { AdminStateBlock } from './AdminStateBlocks';
import { useAdminListState } from './useAdminListState';
import { useAdminToast } from './useAdminToast';
import { useAdminViewState } from './useAdminViewState';
import {
  PanelDrawerFooter,
  PanelDrawerHeader,
  PanelDrawerSection,
  PanelFilterSelect,
  PanelSearchField,
  PanelTableFooter,
} from '../../components/Panel/PanelPrimitives';
import { ADMIN_VIEW_KEYS } from './adminListView';
import { adminReviewService, type Review, type ReviewStatus } from './adminReviewService';
import { listAdminOrders } from './adminOrderService';
import AdminConfirmDialog from './AdminConfirmDialog';
import Drawer from '../../components/Drawer/Drawer';
import { toDisplayOrderCode } from '../../utils/displayCode';

const normalizeStatus = (status?: string | null): ReviewStatus => {
  const normalized = status?.toLowerCase();
  return normalized === 'hidden' ? 'hidden' : 'visible';
};

const ReviewStatusBadge = ({ status }: { status?: ReviewStatus | string | null }) => {
  const config: Record<ReviewStatus, { label: string; pillClass: string }> = {
    visible: { label: 'Đang hiển thị', pillClass: 'admin-pill success' },
    hidden: { label: 'Đã ẩn', pillClass: 'admin-pill neutral' },
  };
  const { label, pillClass } = config[normalizeStatus(status)];
  return <span className={pillClass}>{label}</span>;
};

const RatingStars = ({ rating, size = 13 }: { rating: number; size?: number }) => (
  <div className="review-rating-stars">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        size={size}
        style={{ color: star <= rating ? '#facc15' : '#d1d5db', fill: star <= rating ? '#facc15' : 'none' }}
      />
    ))}
  </div>
);

type RatingFilter = 'all' | '5' | '4' | '1-3';

const ratingFilters: Array<{ key: RatingFilter; label: string }> = [
  { key: 'all', label: 'Tất cả sao' },
  { key: '5', label: '5 sao' },
  { key: '4', label: '4 sao' },
  { key: '1-3', label: '1-3 sao' },
];

const validRatingFilters = new Set<RatingFilter>(ratingFilters.map((item) => item.key));

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const formatDateTime = (iso?: string | null) => {
  if (!iso) return 'Chưa có dữ liệu';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('vi-VN', {
    hour12: false,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const first = parts[0]?.charAt(0) || '';
  const last = parts[parts.length - 1]?.charAt(0) || '';
  return `${first}${last}`.toUpperCase();
};
const AdminReviews = () => {
  const { toast, pushToast } = useAdminToast();
  const [allReviews, setAllReviews] = useState<(Review & { productMeta?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerReview, setDrawerReview] = useState<Review | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; names: string[] } | null>(null);

  useEffect(() => {
    let active = true;

    const fetchReviews = async () => {
      setIsLoading(true);
      try {
        const [res, orders] = await Promise.all([
          adminReviewService.getAll({ size: 1000 }),
          listAdminOrders(),
        ]);

        const orderMap = new Map(orders.map((o) => [o.code, o]));

        const enhanced = (res.content || []).map((review) => {
          const order = orderMap.get(review.orderCode || '');
          const matchingItem = order?.items.find((item) => item.name === review.productName);
          return {
            ...review,
            productMeta: matchingItem?.size || 'Chưa có biến thể',
          };
        });

        if (active) setAllReviews(enhanced);
      } catch {
        if (active) pushToast('Không tải được đánh giá.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void fetchReviews();
    return () => {
      active = false;
    };
  }, [pushToast]);

  const view = useAdminViewState({
    storageKey: ADMIN_VIEW_KEYS.reviews,
    path: '/admin/reviews',
    validStatusKeys: ['all', 'visible', 'hidden'],
    defaultStatus: 'visible',
    extraFilters: [
      { key: 'rating', defaultValue: 'all', validate: (value) => validRatingFilters.has(value as RatingFilter) },
    ],
  });
  const ratingFilter = (validRatingFilters.has(view.extras.rating as RatingFilter) ? view.extras.rating : 'all') as RatingFilter;

  const filteredByStatus = useMemo(() => {
    let next = view.status === 'all' ? allReviews : allReviews.filter((item) => normalizeStatus(item.status) === view.status);
    if (ratingFilter !== 'all') {
      next = next.filter((item) => {
        if (ratingFilter === '5') return item.rating === 5;
        if (ratingFilter === '4') return item.rating === 4;
        return item.rating >= 1 && item.rating <= 3;
      });
    }
    return next;
  }, [allReviews, ratingFilter, view.status]);

  const {
    search,
    filteredItems,
    pagedItems,
    page,
    setPage,
    totalPages,
    startIndex,
    endIndex,
  } = useAdminListState<Review & { productMeta?: string }>({
    items: filteredByStatus,
    pageSize: 8,
    searchValue: view.search,
    onSearchChange: view.setSearch,
    pageValue: view.page,
    onPageChange: view.setPage,
    getSearchText: (row) => `${row.productName} ${row.customerName} ${row.content} ${row.orderCode || ''}`,
    filterPredicate: () => true,
    loadingDeps: [view.status, ratingFilter],
  });

  const stats = useMemo(() => {
    const total = allReviews.length;
    const visible = allReviews.filter((item) => normalizeStatus(item.status) === 'visible').length;
    const hidden = allReviews.filter((item) => normalizeStatus(item.status) === 'hidden').length;
    const averageRating = total ? allReviews.reduce((sum, row) => sum + row.rating, 0) / total : 0;
    return { total, visible, hidden, averageRating };
  }, [allReviews]);

  const tabCounts = useMemo(
    () => ({
      all: allReviews.length,
      visible: allReviews.filter((item) => normalizeStatus(item.status) === 'visible').length,
      hidden: allReviews.filter((item) => normalizeStatus(item.status) === 'hidden').length,
    }),
    [allReviews],
  );

  const ratingCounts: Record<RatingFilter, number> = {
    all: allReviews.length,
    '5': allReviews.filter((item) => item.rating === 5).length,
    '4': allReviews.filter((item) => item.rating === 4).length,
    '1-3': allReviews.filter((item) => item.rating >= 1 && item.rating <= 3).length,
  };

  const handleHide = useCallback(
    async (id: string) => {
      try {
        const updated = await adminReviewService.hide(id);
        setAllReviews((prev) => prev.map((item) => (item.id === id ? updated : item)));
      } catch {
        // silently fail
      }
    },
    [],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await Promise.all(deleteTarget.ids.map((id) => adminReviewService.delete(id)));
      setAllReviews((prev) => prev.filter((item) => !deleteTarget.ids.includes(item.id)));
      if (drawerReview && deleteTarget.ids.includes(drawerReview.id)) {
        setDrawerReview(null);
      }
    } catch {
      // silently fail
    } finally {
      setSelected(new Set());
      setDeleteTarget(null);
    }
  }, [deleteTarget, drawerReview]);

  const resetCurrentView = () => {
    view.resetCurrentView();
    setSelected(new Set());
    setDrawerReview(null);
  };

  const changeStatus = (key: string) => {
    setSelected(new Set());
    setDrawerReview(null);
    view.setStatus(key);
  };

  const changeSearch = (value: string) => {
    setSelected(new Set());
    setDrawerReview(null);
    view.setSearch(value);
  };

  const changeRating = (value: string) => {
    setSelected(new Set());
    setDrawerReview(null);
    view.setExtra('rating', value);
  };

  return (
    <AdminLayout title="Đánh giá" breadcrumbs={['Đánh giá', 'Quản lý']}>
      <div className="admin-stats grid-4">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Tổng đánh giá</div>
          <div className="admin-stat-value">{stats.total}</div>
          <div className="admin-stat-sub">Tất cả phản hồi từ khách hàng</div>
        </div>
        <div className="admin-stat-card success" onClick={() => changeStatus('visible')} style={{ cursor: 'pointer' }}>
          <div className="admin-stat-label">Đang hiển thị</div>
          <div className="admin-stat-value">{stats.visible}</div>
          <div className="admin-stat-sub">Đang xuất hiện trên trang sản phẩm</div>
        </div>
        <div
          className={`admin-stat-card ${stats.hidden > 0 ? 'warning' : ''}`}
          onClick={() => changeStatus('hidden')}
          style={{ cursor: 'pointer' }}
        >
          <div className="admin-stat-label">Đã ẩn</div>
          <div className="admin-stat-value">{stats.hidden}</div>
          <div className="admin-stat-sub">Đã bị ẩn khỏi storefront</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Đánh giá trung bình</div>
          <div className="admin-stat-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {stats.averageRating.toFixed(1)}
            <Star size={18} style={{ color: '#facc15', fill: '#facc15' }} />
          </div>
          <div className="admin-stat-sub">Mức độ hài lòng khách hàng</div>
        </div>
      </div>

      <section className="admin-panels single">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Danh sách đánh giá</h2>
          </div>
          <div className="admin-filter-toolbar">
            <PanelSearchField
              placeholder="Tìm sản phẩm, khách hàng, nội dung hoặc mã đơn"
              ariaLabel="Tìm đánh giá"
              value={search}
              onChange={changeSearch}
            />
            <PanelFilterSelect
              label="Trạng thái"
              ariaLabel="Lọc đánh giá theo trạng thái"
              items={[
                { key: 'all', label: 'Tất cả', count: tabCounts.all },
                { key: 'visible', label: 'Đang hiển thị', count: tabCounts.visible },
                { key: 'hidden', label: 'Đã ẩn', count: tabCounts.hidden },
              ]}
              value={view.status}
              onChange={changeStatus}
            />
            <PanelFilterSelect
              label="Điểm sao"
              ariaLabel="Lọc đánh giá theo điểm sao"
              items={ratingFilters.map((item) => ({ key: item.key, label: item.label, count: ratingCounts[item.key] }))}
              value={ratingFilter}
              onChange={changeRating}
            />
            {view.hasViewContext ? (
              <button type="button" className="admin-filter-reset" onClick={resetCurrentView}>
                Đặt lại
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <AdminStateBlock type="empty" title="Đang tải dữ liệu" description="Hệ thống đang đồng bộ với backend..." />
          ) : filteredItems.length === 0 ? (
            <AdminStateBlock
              type={search.trim() ? 'search-empty' : 'empty'}
              title={search.trim() ? 'Không tìm thấy đánh giá phù hợp' : 'Chưa có đánh giá nào'}
              description={
                search.trim()
                  ? 'Thử đổi từ khóa tìm kiếm hoặc đặt lại bộ lọc.'
                  : 'Đánh giá mới sẽ hiển thị tại đây để admin theo dõi và xử lý ẩn/xóa khi cần.'
              }
              actionLabel="Đặt lại"
              onAction={resetCurrentView}
            />
          ) : (
            <>
              <div className="admin-table admin-responsive-table admin-reviews-table" role="table" aria-label="Bảng đánh giá">
                <div className="admin-table-row admin-table-head reviews" role="row">
                  <div role="columnheader">
                    <input
                      type="checkbox"
                      checked={selected.size === filteredItems.length && filteredItems.length > 0}
                      onChange={(event) =>
                        setSelected(event.target.checked ? new Set(filteredItems.map((item) => item.id)) : new Set())
                      }
                    />
                  </div>
                  <div role="columnheader">STT</div>
                  <div role="columnheader">Sản phẩm</div>
                  <div role="columnheader">Khách hàng</div>
                  <div role="columnheader">Sao</div>
                  <div role="columnheader">Ngày</div>
                  <div role="columnheader">Trạng thái</div>
                  <div role="columnheader" style={{ textAlign: 'right', paddingRight: '12px' }}>
                    Hành động
                  </div>
                </div>

                {pagedItems.map((review, index) => (
                  <motion.div
                    key={review.id}
                    className="admin-table-row reviews"
                    role="row"
                    whileHover={{ y: -1 }}
                    onClick={() => setDrawerReview(review)}
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
                    <div role="cell" className="admin-mono">
                      {startIndex + index}
                    </div>
                    <div role="cell" className="order-product-cell">
                      <img src={review.productImage} alt={review.productName} className="order-product-thumb" />
                      <div className="order-product-copy">
                        <p className="admin-bold order-product-name">{review.productName}</p>
                        <p className="admin-muted order-product-meta">{review.productMeta}</p>
                      </div>
                    </div>
                    <div role="cell" className="customer-info-cell">
                      <div className="customer-text">
                        <p className="admin-bold customer-name">{review.customerName}</p>
                        <p className="admin-muted customer-email">{review.customerEmail}</p>
                      </div>
                    </div>
                    <div role="cell" className="review-rating-cell">
                      <RatingStars rating={review.rating} />
                    </div>
                    <div role="cell" className="order-date admin-muted">
                      {formatDate(review.date)}
                    </div>
                    <div role="cell">
                      <ReviewStatusBadge status={review.status} />
                    </div>
                    <div role="cell" className="admin-actions" onClick={(event) => event.stopPropagation()}>
                      <button className="admin-icon-btn subtle" title="Xem chi tiết" onClick={() => setDrawerReview(review)}>
                        <Eye size={16} />
                      </button>
                      {normalizeStatus(review.status) !== 'hidden' && (
                        <button className="admin-icon-btn subtle" onClick={() => void handleHide(review.id)} title="Ẩn">
                          <EyeOff size={16} />
                        </button>
                      )}
                      <button
                        className="admin-icon-btn subtle danger-icon"
                        onClick={() => setDeleteTarget({ ids: [review.id], names: [review.productName] })}
                        title="Xóa"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="admin-mobile-cards" aria-label="Danh sách đánh giá dạng thẻ">
                {pagedItems.map((review) => (
                  <article key={review.id} className="admin-mobile-card">
                    <div className="admin-mobile-card-head">
                      <div className="admin-mobile-card-title">
                        <img src={review.productImage} alt={review.productName} />
                        <div className="admin-mobile-card-title-main">
                          <p className="admin-bold">{review.productName}</p>
                          <p className="admin-mobile-card-sub">{review.customerName}</p>
                        </div>
                      </div>
                      <ReviewStatusBadge status={review.status} />
                    </div>
                    <div className="admin-mobile-card-grid">
                      <div className="admin-mobile-card-field">
                        <span>Đánh giá</span>
                        <strong>{review.rating}/5</strong>
                        <p><RatingStars rating={review.rating} size={13} /></p>
                      </div>
                      <div className="admin-mobile-card-field">
                        <span>Khách hàng</span>
                        <strong>{review.customerName}</strong>
                        <p>{review.customerEmail}</p>
                      </div>
                      <div className="admin-mobile-card-field">
                        <span>Ngày</span>
                        <strong>{formatDate(review.date)}</strong>
                      </div>
                      <div className="admin-mobile-card-field">
                        <span>Nội dung</span>
                        <strong>{review.content || 'Chưa có nội dung'}</strong>
                      </div>
                    </div>
                    <div className="admin-mobile-card-actions">
                      <button className="admin-primary-btn" type="button" onClick={() => setDrawerReview(review)}>
                        <Eye size={16} />
                        Xem chi tiết
                      </button>
                      {normalizeStatus(review.status) !== 'hidden' && (
                        <button className="admin-icon-btn subtle" onClick={() => void handleHide(review.id)} title="Ẩn" aria-label="Ẩn đánh giá">
                          <EyeOff size={16} />
                        </button>
                      )}
                      <button
                        className="admin-icon-btn subtle danger-icon"
                        onClick={() => setDeleteTarget({ ids: [review.id], names: [review.productName] })}
                        title="Xóa"
                        aria-label="Xóa đánh giá"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <PanelTableFooter
                meta={`Hiển thị ${startIndex}-${endIndex} của ${filteredItems.length} đánh giá`}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                prevLabel="Trước"
                nextLabel="Tiếp"
              />
            </>
          )}
        </div>
      </section>

      <Drawer
        open={Boolean(drawerReview)}
        onClose={() => setDrawerReview(null)}
        size="lg"
        ariaLabel="Chi tiết đánh giá"
      >
        {drawerReview ? (
          <>
            <PanelDrawerHeader
              eyebrow="Chi tiết đánh giá"
              title={drawerReview.productName}
              onClose={() => setDrawerReview(null)}
              closeLabel="Đóng chi tiết đánh giá"
            />
            <div className="drawer-body">
              <PanelDrawerSection title="Tổng quan đánh giá">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>

                  {/* Hero Profile Block */}
                  <div
                    className="reviews-drawer-hero"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                    }}
                  >
                    <div
                      className="returns-customer-avatar large"
                    >
                      {getInitials(drawerReview.customerName)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                        {drawerReview.customerName}
                      </span>
                      <span className="admin-muted" style={{ fontSize: '13px', color: '#64748b' }}>
                        {drawerReview.customerEmail || 'Chưa cung cấp email'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                        <RatingStars rating={drawerReview.rating} size={14} />
                        <strong style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                          {drawerReview.rating}/5
                        </strong>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', flexShrink: 0 }}>
                      <ReviewStatusBadge status={drawerReview.status} />
                      <span className={`admin-pill ${drawerReview.rating <= 3 ? 'pending' : 'success'}`}>
                        {drawerReview.rating <= 3 ? 'Cần chăm sóc' : 'Ổn định'}
                      </span>
                    </div>
                  </div>

                  {/* Product Association Card */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      background: '#ffffff',
                    }}
                  >
                    <img
                      src={drawerReview.productImage}
                      alt={drawerReview.productName}
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                      <p className="admin-bold" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {drawerReview.productName}
                      </p>
                      <p className="admin-muted" style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 0 0' }}>
                        Mã đơn hàng: <strong>#{toDisplayOrderCode(drawerReview.orderCode)}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Metadata Cards Grid */}
                  <div className="returns-meta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                    <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Mã sản phẩm / Slug
                      </span>
                      <strong className="returns-meta-value returns-code" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                        {drawerReview.productSlug || drawerReview.productId || 'Chưa có'}
                      </strong>
                    </div>
                    <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Thời gian đánh giá
                      </span>
                      <strong className="returns-meta-value" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                        {formatDateTime(drawerReview.date)}
                      </strong>
                    </div>
                  </div>

                </div>
              </PanelDrawerSection>

              <PanelDrawerSection title="Nội dung khách hàng">
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', padding: '14px' }}>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '13px', color: '#334155' }}>
                    {drawerReview.content || 'Khách hàng chưa để lại nội dung.'}
                  </p>
                </div>
              </PanelDrawerSection>

              <PanelDrawerSection title="Ảnh đính kèm">
                {drawerReview.images && drawerReview.images.length > 0 ? (
                  <div className="review-drawer-media-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                    {drawerReview.images.map((image, idx) => (
                      <a
                        key={`${drawerReview.id}-${idx}`}
                        href={image}
                        target="_blank"
                        rel="noreferrer"
                        className="review-drawer-media-item"
                        style={{ display: 'block', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', aspectRatio: '1', background: '#f1f5f9' }}
                      >
                        <img src={image} alt={`Review media ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', padding: '14px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Đánh giá này không đính kèm ảnh.</p>
                  </div>
                )}
              </PanelDrawerSection>

              <PanelDrawerSection title="Phản hồi từ người bán">
                {drawerReview.reply ? (
                  <div style={{ border: '1px solid #fef08a', borderRadius: '12px', background: '#fefce8', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '13px', color: '#854d0e', fontWeight: 700 }}>Đã phản hồi</strong>
                      <span style={{ fontSize: '11px', color: '#a16207' }}>{formatDateTime(drawerReview.replyAt)}</span>
                    </div>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '13px', color: '#713f12' }}>
                      {drawerReview.reply}
                    </p>
                  </div>
                ) : (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', padding: '14px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Shop chưa phản hồi đánh giá này.</p>
                  </div>
                )}
              </PanelDrawerSection>
            </div>
            <PanelDrawerFooter>
              <button className="admin-ghost-btn" style={{ marginLeft: 'auto' }} onClick={() => setDrawerReview(null)}>
                Đóng
              </button>
              {normalizeStatus(drawerReview.status) !== 'hidden' && (
                <button
                  className="admin-ghost-btn"
                  onClick={() => {
                    void handleHide(drawerReview.id);
                    setDrawerReview(null);
                  }}
                >
                  <EyeOff size={15} />
                  Ẩn
                </button>
              )}
              <button
                className="admin-ghost-btn danger"
                onClick={() => setDeleteTarget({ ids: [drawerReview.id], names: [drawerReview.productName] })}
              >
                <Trash2 size={15} />
                Xóa
              </button>
            </PanelDrawerFooter>
          </>
        ) : null}
      </Drawer>

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Xóa đánh giá"
        description="Bạn có chắc chắn muốn xóa đánh giá này khỏi hệ thống? Hành động này không thể hoàn tác."
        selectedItems={deleteTarget?.names}
        selectedNoun="review"
        confirmLabel="Xóa đánh giá"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />

      {toast && <div className="toast success">{toast}</div>}
    </AdminLayout>
  );
};

export default AdminReviews;
