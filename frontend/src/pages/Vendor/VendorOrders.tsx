import './Vendor.css';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Eye, Truck, XCircle, PackageCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import VendorLayout from './VendorLayout';
import {
  PanelFilterSelect,
  PanelSearchField,
  PanelStatsGrid,
  PanelTableFooter,
} from '../../components/Panel/PanelPrimitives';
import {
  getVendorOrderStatusLabel,
  getVendorOrderStatusTone,
} from './vendorOrderPresentation';
import { formatCurrency } from '../../services/commissionService';
import { vendorPortalService, type VendorOrderSummary, type VendorOrdersPage } from '../../services/vendorPortalService';
import { useToast } from '../../contexts/ToastContext';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { AdminStateBlock, AdminTableSkeleton } from '../Admin/AdminStateBlocks';
import AdminConfirmDialog from '../Admin/AdminConfirmDialog';
import { normalizePositiveInteger } from './vendorHelpers';
import {
  resolveDetailRouteKey,
  toDisplayOrderCode,
} from '../../utils/displayCode';

type VendorOrderTab =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

type OrderUpdateStatus = 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

type PendingAction = {
  ids: string[];
  nextStatus: OrderUpdateStatus;
  title: string;
  description: string;
  confirmLabel: string;
  selectedItems: string[];
  requireTracking?: boolean;
  requireReason?: boolean;
};

const PAGE_SIZE = 8;
const VENDOR_CONFIRMATION_SLA_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const TABS: Array<{ key: VendorOrderTab; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'confirmed', label: 'Đã xác nhận' },
  { key: 'pending', label: 'Chờ xác nhận' },
  { key: 'processing', label: 'Đang xử lý' },
  { key: 'shipped', label: 'Đang giao' },
  { key: 'delivered', label: 'Đã giao' },
  { key: 'cancelled', label: 'Đã hủy' },
];

const emptyOrdersPage: VendorOrdersPage = {
  items: [],
  totalElements: 0,
  totalPages: 1,
  page: 1,
  pageSize: PAGE_SIZE,
  statusCounts: {
    all: 0,
    pending: 0,
    confirmed: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  },
};

const normalizeTab = (value: string | null): VendorOrderTab => {
  if (
    value === 'pending'
    || value === 'confirmed'
    || value === 'processing'
    || value === 'shipped'
    || value === 'delivered'
    || value === 'cancelled'
  ) {
    return value;
  }

  return 'all';
};

const resolveVendorDeadline = (order: VendorOrderSummary): Date | null => {
  const explicit = order.vendorConfirmationDeadlineAt ? new Date(order.vendorConfirmationDeadlineAt) : null;
  if (explicit && !Number.isNaN(explicit.getTime())) {
    return explicit;
  }

  const createdAt = new Date(order.date);
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }
  return new Date(createdAt.getTime() + VENDOR_CONFIRMATION_SLA_DAYS * DAY_MS);
};

const getVendorSlaMeta = (order: VendorOrderSummary): { label: string; tone: 'ok' | 'urgent' | 'overdue' } | null => {
  if (order.status !== 'pending') {
    return null;
  }

  const deadline = resolveVendorDeadline(order);
  if (!deadline) {
    return null;
  }

  const diff = deadline.getTime() - Date.now();
  if (diff <= 0) {
    return { label: 'Quá hạn xác nhận', tone: 'overdue' };
  }

  if (diff < DAY_MS) {
    return { label: `Còn ${Math.max(1, Math.ceil(diff / (60 * 60 * 1000)))} giờ`, tone: 'urgent' };
  }

  return { label: `Còn ${Math.ceil(diff / DAY_MS)} ngày`, tone: 'ok' };
};

const buildActionMeta = (status: OrderUpdateStatus): {
  title: string;
  description: string;
  confirmLabel: string;
  requireTracking?: boolean;
  requireReason?: boolean;
} => {
  switch (status) {
    case 'CONFIRMED':
      return {
        title: 'Xác nhận đơn hàng con',
        description: 'Đơn đã chọn sẽ chuyển sang trạng thái đã xác nhận để shop tiếp nhận.',
        confirmLabel: 'Xác nhận đơn',
      };
    case 'PROCESSING':
      return {
        title: 'Bắt đầu xử lý đơn',
        description: 'Đơn đã chọn sẽ chuyển sang trạng thái đang xử lý để kho đóng gói.',
        confirmLabel: 'Bắt đầu xử lý',
      };
    case 'SHIPPED':
      return {
        title: 'Bàn giao đơn cho vận chuyển',
        description: 'Cần nhập mã vận đơn và đơn vị vận chuyển trước khi chuyển sang đang giao.',
        confirmLabel: 'Bàn giao vận chuyển',
        requireTracking: true,
      };
    case 'DELIVERED':
      return {
        title: 'Xác nhận đã giao thành công',
        description: 'Đơn đã chọn sẽ được đánh dấu đã giao và cập nhật đối soát payout.',
        confirmLabel: 'Xác nhận đã giao',
      };
    case 'CANCELLED':
      return {
        title: 'Hủy đơn hàng con',
        description: 'Cần nhập lý do hủy để hệ thống audit và thông báo cho khách hàng.',
        confirmLabel: 'Xác nhận hủy',
        requireReason: true,
      };
    default:
      return {
        title: 'Cập nhật trạng thái',
        description: 'Bạn có chắc chắn muốn cập nhật trạng thái đơn?',
        confirmLabel: 'Cập nhật',
      };
  }
};

const VendorOrders = () => {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = normalizeTab(searchParams.get('status'));
  const page = normalizePositiveInteger(searchParams.get('page'));
  const keyword = (searchParams.get('q') || '').trim();
  const dateFrom = searchParams.get('date_from') || '';
  const dateTo = searchParams.get('date_to') || '';

  const [searchQuery, setSearchQuery] = useState(keyword);
  const [ordersPage, setOrdersPage] = useState<VendorOrdersPage>(emptyOrdersPage);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [cancelReason, setCancelReason] = useState('');

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
    }, 260);

    return () => window.clearTimeout(timer);
  }, [keyword, searchQuery, updateQuery]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const next = await vendorPortalService.getOrders({
        status: activeTab,
        page,
        size: PAGE_SIZE,
        keyword: keyword || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });

      startTransition(() => {
        setOrdersPage(next);
      });

      setSelected((prev) => {
        const availableIds = new Set(next.items.map((item) => item.id));
        return new Set(Array.from(prev).filter((id) => availableIds.has(id)));
      });

      if (page > next.totalPages) {
        updateQuery((query) => {
          query.set('page', String(next.totalPages));
        }, true);
      }
    } catch (err: unknown) {
      const message = getUiErrorMessage(err, 'Không tải được danh sách đơn hàng shop');
      setLoadError(message);
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, addToast, dateFrom, dateTo, keyword, page, updateQuery]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const paginatedOrders = ordersPage.items;
  const totalPages = Math.max(ordersPage.totalPages || 1, 1);
  const startIndex = paginatedOrders.length === 0 ? 0 : (ordersPage.page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(ordersPage.page * PAGE_SIZE, ordersPage.totalElements);

  const tabCounts = useMemo(() => {
    const source = ordersPage.statusCounts || {};
    const activeTotal = ordersPage.totalElements;
    const resolvedActiveKey = activeTab === 'all' ? 'all' : activeTab;
    return {
      all: Number(source.all || (activeTab === 'all' ? activeTotal : 0)),
      pending: Number(source.pending || (resolvedActiveKey === 'pending' ? activeTotal : 0)),
      confirmed: Number(source.confirmed || (resolvedActiveKey === 'confirmed' ? activeTotal : 0)),
      processing: Number(source.processing || (resolvedActiveKey === 'processing' ? activeTotal : 0)),
      shipped: Number(source.shipped || (resolvedActiveKey === 'shipped' ? activeTotal : 0)),
      delivered: Number(source.delivered || (resolvedActiveKey === 'delivered' ? activeTotal : 0)),
      cancelled: Number(source.cancelled || (resolvedActiveKey === 'cancelled' ? activeTotal : 0)),
    };
  }, [activeTab, ordersPage.statusCounts, ordersPage.totalElements]);

  const hasViewContext = activeTab !== 'all' || Boolean(keyword) || Boolean(dateFrom) || Boolean(dateTo);

  const handleTabChange = (key: string) => {
    const nextTab = normalizeTab(key);
    setSelected(new Set());
    updateQuery((query) => {
      if (nextTab === 'all') {
        query.delete('status');
      } else {
        query.set('status', nextTab);
      }
      query.set('page', '1');
    });
  };

  const handleDateFilterChange = (key: 'date_from' | 'date_to', value: string) => {
    setSelected(new Set());
    updateQuery((query) => {
      if (value) {
        query.set(key, value);
      } else {
        query.delete(key);
      }
      query.set('page', '1');
    });
  };

  const setPage = (nextPage: number) => {
    updateQuery((query) => {
      query.set('page', String(Math.max(1, nextPage)));
    });
  };

  const resetCurrentView = () => {
    setSearchQuery('');
    setSelected(new Set());
    setSearchParams(new URLSearchParams());
  };
  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(paginatedOrders.map((order) => order.id)));
      return;
    }
    setSelected(new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const askStatusUpdate = (ids: string[], nextStatus: OrderUpdateStatus) => {
    const selectedOrders = paginatedOrders.filter((order) => ids.includes(order.id));
    if (selectedOrders.length === 0) return;

    const meta = buildActionMeta(nextStatus);

    setTrackingNumber('');
    setCarrier('');
    setCancelReason('');
    setPendingAction({
      ids,
      nextStatus,
      title: meta.title,
      description: meta.description,
      confirmLabel: meta.confirmLabel,
      requireTracking: meta.requireTracking,
      requireReason: meta.requireReason,
      selectedItems: selectedOrders.map((order) => toDisplayOrderCode(order.code)),
    });
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;

    if (pendingAction.requireTracking) {
      if (!trackingNumber.trim()) {
        addToast('Cần nhập mã vận đơn trước khi bàn giao', 'error');
        return;
      }
      if (!carrier.trim()) {
        addToast('Cần nhập đơn vị vận chuyển trước khi bàn giao', 'error');
        return;
      }
    }

    if (pendingAction.requireReason && !cancelReason.trim()) {
      addToast('Cần nhập lý do hủy đơn', 'error');
      return;
    }

    setUpdating(true);
    try {
      await Promise.all(
        pendingAction.ids.map((id) =>
          vendorPortalService.updateOrderStatus(id, pendingAction.nextStatus, {
            trackingNumber: pendingAction.requireTracking ? trackingNumber.trim() : undefined,
            carrier: pendingAction.requireTracking ? carrier.trim() : undefined,
            reason: pendingAction.requireReason ? cancelReason.trim() : undefined,
          }),
        ),
      );

      setSelected(new Set());
      setPendingAction(null);
      addToast('Đã cập nhật trạng thái đơn hàng con', 'success');
      await loadOrders();
    } catch (err: unknown) {
      addToast(getUiErrorMessage(err, 'Không thể cập nhật trạng thái đơn hàng'), 'error');
    } finally {
      setUpdating(false);
    }
  };


  const statItems = [
    {
      key: 'all',
      label: 'Tổng đơn hàng con',
      value: tabCounts.all,
      sub: 'Toàn bộ fulfillment của shop',
      onClick: () => handleTabChange('all'),
    },
    {
      key: 'pending',
      label: 'Chờ xác nhận',
      value: tabCounts.pending,
      sub: 'Cần shop tiếp nhận ngay',
      tone: 'warning' as const,
      onClick: () => handleTabChange('pending'),
    },
    {
      key: 'processing',
      label: 'Đang xử lý',
      value: tabCounts.processing,
      sub: 'Đang đóng gói và chuẩn bị giao',
      tone: 'info' as const,
      onClick: () => handleTabChange('processing'),
    },
    {
      key: 'delivered',
      label: 'Đã giao',
      value: tabCounts.delivered,
      sub: 'Đơn đã hoàn tất đối soát',
      tone: 'success' as const,
      onClick: () => handleTabChange('delivered'),
    },
  ];

  const tabItems = TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: tabCounts[tab.key],
  }));
  const allSelected = paginatedOrders.length > 0 && selected.size === paginatedOrders.length;
  const isPendingConfirmDisabled = updating
    || Boolean(pendingAction?.requireTracking && (!trackingNumber.trim() || !carrier.trim()))
    || Boolean(pendingAction?.requireReason && !cancelReason.trim());

  const renderOrderActions = (order: VendorOrderSummary) => (
    <div className="admin-actions vendor-order-actions">
      <Link to={`/vendor/orders/${resolveDetailRouteKey(order.code, order.id)}`} className="admin-icon-btn subtle vendor-action-view" title="Chi tiết đơn hàng" aria-label={`Chi tiết đơn ${toDisplayOrderCode(order.code)}`}>
        <Eye size={16} />
      </Link>
      {order.status === 'pending' && (
        <button
          className="admin-icon-btn subtle vendor-action-confirm success-icon"
          title="Xác nhận đơn"
          aria-label={`Xác nhận đơn ${toDisplayOrderCode(order.code)}`}
          onClick={() => askStatusUpdate([order.id], 'CONFIRMED')}
          disabled={updating}
        >
          <CheckCircle2 size={16} />
        </button>
      )}
      {order.status === 'confirmed' && (
        <button
          className="admin-icon-btn subtle vendor-action-confirm"
          title="Bắt đầu xử lý"
          aria-label={`Bắt đầu xử lý đơn ${toDisplayOrderCode(order.code)}`}
          onClick={() => askStatusUpdate([order.id], 'PROCESSING')}
          disabled={updating}
        >
          <PackageCheck size={16} />
        </button>
      )}
      {order.status === 'processing' && (
        <button
          className="admin-icon-btn subtle vendor-action-confirm"
          title="Bàn giao vận chuyển"
          aria-label={`Bàn giao vận chuyển đơn ${toDisplayOrderCode(order.code)}`}
          onClick={() => askStatusUpdate([order.id], 'SHIPPED')}
          disabled={updating}
        >
          <Truck size={16} />
        </button>
      )}
      {order.status === 'shipped' && (
        <button
          className="admin-icon-btn subtle vendor-action-confirm"
          title="Xác nhận đã giao"
          aria-label={`Xác nhận đã giao đơn ${toDisplayOrderCode(order.code)}`}
          onClick={() => askStatusUpdate([order.id], 'DELIVERED')}
          disabled={updating}
        >
          <PackageCheck size={16} />
        </button>
      )}
      {order.status !== 'pending'
        && order.status !== 'confirmed'
        && order.status !== 'processing'
        && order.status !== 'shipped' && (
          <span className="vendor-order-action-slot" aria-hidden="true" />
        )}
      {(order.status === 'pending' || order.status === 'confirmed' || order.status === 'processing') ? (
        <button
          className="admin-icon-btn subtle danger-icon"
          title="Hủy đơn"
          aria-label={`Hủy đơn ${toDisplayOrderCode(order.code)}`}
          onClick={() => askStatusUpdate([order.id], 'CANCELLED')}
          disabled={updating}
        >
          <XCircle size={16} />
        </button>
      ) : (
        <span className="vendor-order-action-slot" aria-hidden="true" />
      )}
    </div>
  );

  return (
    <VendorLayout
      title="Đơn hàng shop"
      breadcrumbs={['Kênh Người Bán', 'Đơn hàng']}
    >
      <div className="admin-top-grid">
        <PanelStatsGrid items={statItems} />
      </div>

      <div className="admin-panels single">
        <div className="admin-filter-toolbar vendor-filter-toolbar">
          <PanelSearchField
            placeholder="Tìm theo khách hàng, email, mã đơn..."
            ariaLabel="Tìm đơn hàng shop"
            value={searchQuery}
            onChange={setSearchQuery}
          />
          <PanelFilterSelect
            label="Trạng thái"
            ariaLabel="Lọc đơn theo trạng thái"
            items={tabItems}
            value={activeTab}
            onChange={handleTabChange}
          />
          <label className="admin-date-field vendor-date-field">
            <span>Từ ngày</span>
            <input
              type="date"
              value={dateFrom}
              aria-label="Lọc đơn từ ngày"
              onChange={(event) => handleDateFilterChange('date_from', event.target.value)}
            />
          </label>
          <label className="admin-date-field vendor-date-field">
            <span>Đến ngày</span>
            <input
              type="date"
              value={dateTo}
              aria-label="Lọc đơn đến ngày"
              onChange={(event) => handleDateFilterChange('date_to', event.target.value)}
            />
          </label>
          {hasViewContext ? (
            <button type="button" className="admin-filter-reset" onClick={resetCurrentView}>
              Đặt lại
            </button>
          ) : null}
        </div>
        <div className="admin-panel">


          <div className="admin-panel-head">
            <h2>Danh sách đơn hàng</h2>
          </div>
          {loading ? (
            <AdminTableSkeleton columns={8} rows={6} />
          ) : loadError ? (
            <AdminStateBlock
              type="error"
              title="Không tải được danh sách đơn hàng"
              description={loadError}
              actionLabel="Thử lại"
              onAction={() => void loadOrders()}
            />
          ) : paginatedOrders.length === 0 ? (
            <AdminStateBlock
              type={hasViewContext ? 'search-empty' : 'empty'}
              title={hasViewContext ? 'Không tìm thấy đơn hàng phù hợp' : 'Chưa có đơn hàng'}
              description={
                hasViewContext
                  ? 'Thử đổi bộ lọc, từ khóa, hoặc khoảng ngày để tìm kết quả.'
                  : 'Đơn sẽ hiển thị tại đây khi shop có đơn mới.'
              }
              actionLabel={hasViewContext ? 'Xóa bộ lọc' : undefined}
              onAction={hasViewContext ? resetCurrentView : undefined}
            />
          ) : (
            <>
              <div className="admin-table vendor-table vendor-orders-table">
                <div className="admin-table-head admin-table-row vendor-orders">
                  <div>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                    />
                  </div>
                  <div>STT</div>
                  <div>Sản phẩm</div>
                  <div>Khách hàng</div>
                  <div>Giá trị</div>
                  <div>Trạng thái</div>
                  <div>Thời gian</div>
                  <div>Hành động</div>
                </div>

                {paginatedOrders.map((order, index) => {
                  const statusTone = getVendorOrderStatusTone(order.status);
                  const statusLabel = getVendorOrderStatusLabel(order.status);
                  const slaMeta = getVendorSlaMeta(order);
                  const isSelected = selected.has(order.id);
                  const productVariantLine = [order.productMeta, order.productExtra]
                    .map((value) => value?.trim())
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <motion.div
                      key={order.id}
                      className="admin-table-row vendor-orders"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.12 }}
                      style={{ willChange: 'transform' }}
                    >
                      <div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(event) => toggleOne(order.id, event.target.checked)}
                        />
                      </div>
                      <div className="admin-bold">{startIndex + index}</div>
                      <div className="order-product-cell">
                        <img
                          src={order.productImage || order.thumb}
                          alt={order.productName || 'Sản phẩm'}
                          className="vendor-admin-thumb"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="order-product-copy">
                          <p className="admin-bold order-product-name" title={order.productName || 'Sản phẩm'}>
                            {order.productName || 'Sản phẩm'}
                          </p>
                          {productVariantLine ? (
                            <p className="admin-muted order-product-meta" title={productVariantLine}>
                              {productVariantLine}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div className="admin-bold">{order.customer}</div>
                        <div className="admin-muted small">{order.email}</div>
                      </div>
                      <div className="admin-bold">{formatCurrency(order.total)}</div>
                      <div>
                        <div className="vendor-status-stack">
                          <span className={`admin-pill ${statusTone}`}>{statusLabel}</span>
                          {slaMeta ? (
                            <span className={`vendor-sla-chip ${slaMeta.tone}`}>
                              <Clock size={12} />
                              {slaMeta.label}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="order-date-cell">
                        <span className="order-date-time">{new Date(order.date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="order-date-day">{new Date(order.date).toLocaleDateString('vi-VN')}</span>
                      </div>
                      {renderOrderActions(order)}
                    </motion.div>
                  );
                })}
              </div>

              <div className="vendor-mobile-cards vendor-order-card-list" aria-label="Danh sách đơn hàng dạng thẻ">
                {paginatedOrders.map((order, index) => {
                  const statusTone = getVendorOrderStatusTone(order.status);
                  const statusLabel = getVendorOrderStatusLabel(order.status);
                  const slaMeta = getVendorSlaMeta(order);
                  const isSelected = selected.has(order.id);
                  const productVariantLine = [order.productMeta, order.productExtra]
                    .map((value) => value?.trim())
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <motion.article
                      key={`order-card-${order.id}`}
                      className="vendor-mobile-card vendor-order-card"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16, delay: Math.min(index * 0.02, 0.1) }}
                    >
                      <div className="vendor-card-head">
                        <label className="vendor-card-check">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            aria-label={`Chọn đơn ${toDisplayOrderCode(order.code)}`}
                            onChange={(event) => toggleOne(order.id, event.target.checked)}
                          />
                          <span>#{toDisplayOrderCode(order.code)}</span>
                        </label>
                        <div className="vendor-status-stack compact">
                          <span className={`admin-pill ${statusTone}`}>{statusLabel}</span>
                          {slaMeta ? (
                            <span className={`vendor-sla-chip ${slaMeta.tone}`}>
                              <Clock size={12} />
                              {slaMeta.label}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="vendor-card-product">
                        <img
                          src={order.productImage || order.thumb}
                          alt={order.productName || 'Sản phẩm'}
                          className="vendor-admin-thumb"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="order-product-copy">
                          <p className="admin-bold order-product-name" title={order.productName || 'Sản phẩm'}>
                            {order.productName || 'Sản phẩm'}
                          </p>
                          {productVariantLine ? (
                            <p className="admin-muted order-product-meta" title={productVariantLine}>{productVariantLine}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="vendor-card-meta-grid">
                        <div>
                          <span>Khách hàng</span>
                          <strong>{order.customer}</strong>
                          <small>{order.email}</small>
                        </div>
                        <div>
                          <span>Giá trị</span>
                          <strong>{formatCurrency(order.total)}</strong>
                        </div>
                        <div>
                          <span>Thời gian</span>
                          <strong>{new Date(order.date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</strong>
                          <small>{new Date(order.date).toLocaleDateString('vi-VN')}</small>
                        </div>
                      </div>

                      <div className="vendor-card-actions">
                        {renderOrderActions(order)}
                      </div>
                    </motion.article>
                  );
                })}
              </div>

              <PanelTableFooter
                page={ordersPage.page}
                totalPages={totalPages}
                meta={<span>Hiển thị {startIndex}–{endIndex} / {ordersPage.totalElements} đơn</span>}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      </div>

      <AdminConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.title || ''}
        description={pendingAction?.description || ''}
        selectedItems={pendingAction?.selectedItems}
        confirmLabel={updating ? 'Đang xử lý...' : pendingAction?.confirmLabel || 'Xác nhận'}
        confirmDisabled={isPendingConfirmDisabled}
        cancelDisabled={updating}
        variant="vendor"
        onCancel={() => {
          if (!updating) {
            setPendingAction(null);
            setTrackingNumber('');
            setCarrier('');
            setCancelReason('');
          }
        }}
        onConfirm={() => void confirmPendingAction()}
      >
        {pendingAction?.requireTracking && (
          <div className="confirm-form-grid">
            <label className="form-field">
              <span>Mã vận đơn</span>
              <input
                value={trackingNumber}
                onChange={(event) => setTrackingNumber(event.target.value)}
                placeholder="VD: GHN123456789"
              />
            </label>
            <label className="form-field">
              <span>Đơn vị vận chuyển</span>
              <input
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                placeholder="VD: GHN"
              />
            </label>
          </div>
        )}
        {pendingAction?.requireReason && (
          <label className="form-field full" style={{ marginTop: 10 }}>
            <span>Lý do hủy</span>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Nhập lý do hủy đơn"
            />
          </label>
        )}
      </AdminConfirmDialog>
    </VendorLayout>
  );
};

export default VendorOrders;

