import './Admin.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Eye, ShieldAlert, XCircle, X } from 'lucide-react';
import AdminLayout from './AdminLayout';
import AdminConfirmDialog from './AdminConfirmDialog';
import { AdminStateBlock } from './AdminStateBlocks';
import { useAdminToast } from './useAdminToast';
import { returnService, type AdminVerdictAction, type ReturnRequest, type ReturnStatus } from '../../services/returnService';
import {
  PanelDrawerFooter,
  PanelDrawerHeader,
  PanelDrawerSection,
  PanelFilterSelect,
  PanelSearchField,
  PanelStatsGrid,
  PanelTableFooter,
} from '../../components/Panel/PanelPrimitives';
import Drawer from '../../components/Drawer/Drawer';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { toDisplayOrderCode, toDisplayReturnCode } from '../../utils/displayCode';
import { ADMIN_VIEW_KEYS } from './adminListView';
import { useAdminViewState } from './useAdminViewState';

const statusConfig: Record<ReturnStatus, { label: string; pillClass: string }> = {
  REQUESTED: { label: 'Chờ lấy hàng', pillClass: 'admin-pill neutral' },
  IN_TRANSIT: { label: 'Đang vận chuyển', pillClass: 'admin-pill neutral' },
  DELIVERED_TO_SELLER: { label: 'Chờ vendor xử lý (48h)', pillClass: 'admin-pill pending' },
  REFUND_SUCCESS: { label: 'Đã hoàn tiền', pillClass: 'admin-pill success' },
  DISPUTING: { label: 'Tranh chấp', pillClass: 'admin-pill error' },
  RETURN_REJECTED: { label: 'Từ chối', pillClass: 'admin-pill error' },
  CANCELLED: { label: 'Đã hủy', pillClass: 'admin-pill neutral' },
};

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'disputed', label: 'Tranh chấp' },
  { key: 'pendingVendor', label: 'Chờ vendor' },
  { key: 'inProgress', label: 'Đang xử lý' },
  { key: 'completed', label: 'Đã hoàn tiền' },
  { key: 'rejected', label: 'Đã từ chối' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const reasonLabel: Record<string, string> = {
  SIZE: 'Không đúng kích cỡ',
  DEFECT: 'Lỗi sản phẩm',
  CHANGE: 'Muốn đổi sản phẩm',
  OTHER: 'Lý do khác',
};

const resolutionLabel: Record<string, string> = {
  EXCHANGE: 'Đổi sản phẩm',
  REFUND: 'Hoàn tiền',
};

const PAGE_SIZE = 8;

const TAB_STATUS_MAP: Record<TabKey, ReturnStatus[] | undefined> = {
  all: undefined,
  disputed: ['DISPUTING'],
  pendingVendor: ['DELIVERED_TO_SELLER'],
  inProgress: ['REQUESTED', 'IN_TRANSIT'],
  completed: ['REFUND_SUCCESS'],
  rejected: ['RETURN_REJECTED', 'CANCELLED'],
};

const formatVnd = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDateTime = (value?: string) => {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';
  return date.toLocaleString('vi-VN', {
    hour12: false,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getReturnAmount = (request: ReturnRequest) => {
  if (typeof request.refundAmount === 'number') return request.refundAmount;
  return request.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
};

type AdminTabCounts = Record<TabKey, number>;
type VerdictConfirmState = {
  id: string;
  code: string;
  action: AdminVerdictAction;
  label: string;
  danger: boolean;
};

const EMPTY_ADMIN_COUNTS: AdminTabCounts = {
  all: 0,
  disputed: 0,
  pendingVendor: 0,
  inProgress: 0,
  completed: 0,
  rejected: 0,
};

const getInitials = (name: string) => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const resolveEvidenceUrl = (path?: string) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
};

const AdminReturns = () => {
  const { pushToast } = useAdminToast();
  const [rows, setRows] = useState<ReturnRequest[]>([]);
  const [tabCounts, setTabCounts] = useState<AdminTabCounts>(EMPTY_ADMIN_COUNTS);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<ReturnRequest | null>(null);
  const [drawerNote, setDrawerNote] = useState('');
  const [activeEnlargedImage, setActiveEnlargedImage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [verdictConfirm, setVerdictConfirm] = useState<VerdictConfirmState | null>(null);
  const view = useAdminViewState({
    storageKey: ADMIN_VIEW_KEYS.returns,
    path: '/admin/returns',
    validStatusKeys: TABS.map((tab) => tab.key),
    defaultStatus: 'all',
  });
  const activeTab = (TABS.some((tab) => tab.key === view.status) ? view.status : 'all') as TabKey;
  const page = view.page;

  const drawerItemCount = useMemo(
    () => (drawerItem ? drawerItem.items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0) : 0),
    [drawerItem],
  );
  const drawerRefundTotal = useMemo(() => (drawerItem ? getReturnAmount(drawerItem) : 0), [drawerItem]);

  const fetchTabCounts = useCallback(async () => {
    try {
      const [all, disputed, pendingVendor, inProgress, completed, rejected] = await Promise.all([
        returnService.listAdmin({ page: 0, size: 1 }),
        returnService.listAdmin({ statuses: ['DISPUTING'], page: 0, size: 1 }),
        returnService.listAdmin({ statuses: ['DELIVERED_TO_SELLER'], page: 0, size: 1 }),
        returnService.listAdmin({ statuses: ['REQUESTED', 'IN_TRANSIT'], page: 0, size: 1 }),
        returnService.listAdmin({ statuses: ['REFUND_SUCCESS'], page: 0, size: 1 }),
        returnService.listAdmin({ statuses: ['RETURN_REJECTED', 'CANCELLED'], page: 0, size: 1 }),
      ]);

      setTabCounts({
        all: Number(all.totalElements || 0),
        disputed: Number(disputed.totalElements || 0),
        pendingVendor: Number(pendingVendor.totalElements || 0),
        inProgress: Number(inProgress.totalElements || 0),
        completed: Number(completed.totalElements || 0),
        rejected: Number(rejected.totalElements || 0),
      });
    } catch {
      // Keep previous stats when counting fails.
    }
  }, []);

  const fetchPageData = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const response = await returnService.listAdmin({
        statuses: TAB_STATUS_MAP[activeTab],
        q: view.search,
        page: Math.max(page - 1, 0),
        size: PAGE_SIZE,
      });
      setRows(response.content || []);
      setTotalElements(Number(response.totalElements || 0));
      setTotalPages(Math.max(Number(response.totalPages || 1), 1));
      setSelected((prev) => {
        if (prev.size === 0) return prev;
        const visibleIds = new Set((response.content || []).map((item) => item.id));
        return new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      });
    } catch (error: unknown) {
      setRows([]);
      setTotalElements(0);
      setTotalPages(1);
      setLoadError(getUiErrorMessage(error, 'Không tải được danh sách yêu cầu hoàn trả từ backend.'));
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, page, view.search]);

  useEffect(() => {
    void fetchTabCounts();
  }, [fetchTabCounts]);

  useEffect(() => {
    void fetchPageData();
  }, [fetchPageData]);

  useEffect(() => {
    if (page > totalPages) {
      view.setPage(totalPages);
    }
  }, [page, totalPages, view]);

  const safePage = Math.min(page, totalPages);
  const startIndex = totalElements === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(totalElements, safePage * PAGE_SIZE);

  const applyFinalVerdict = async (id: string, action: AdminVerdictAction) => {
    try {
      setActionLoading(true);
      const adminNote = drawerItem?.id === id ? drawerNote : undefined;
      const updated = await returnService.adminFinalVerdict(id, action, adminNote);

      setDrawerItem((current) => (current?.id === id ? updated : current));
      if (drawerItem?.id === id) setDrawerNote('');
      await Promise.all([fetchPageData(), fetchTabCounts()]);

      pushToast(
        action === 'REFUND_TO_CUSTOMER'
          ? `Đã ra phán quyết hoàn tiền cho ${toDisplayReturnCode(updated.code)}.`
          : `Đã ra phán quyết giữ tiền cho vendor với ${toDisplayReturnCode(updated.code)}.`,
      );
    } catch (error: unknown) {
      pushToast(getUiErrorMessage(error, 'Không thể xử lý phán quyết tranh chấp.'));
    } finally {
      setActionLoading(false);
    }
  };

  const resetCurrentView = () => {
    setSelected(new Set());
    setDrawerItem(null);
    setDrawerNote('');
    view.resetCurrentView();
  };

  const changeTab = (key: string) => {
    setSelected(new Set());
    setDrawerItem(null);
    setDrawerNote('');
    view.setStatus(key);
  };

  const changeSearch = (value: string) => {
    setSelected(new Set());
    setDrawerItem(null);
    setDrawerNote('');
    view.setSearch(value);
  };

  const openVerdictConfirm = (item: ReturnRequest, action: AdminVerdictAction) => {
    setVerdictConfirm({
      id: item.id,
      code: toDisplayReturnCode(item.code),
      action,
      label: action === 'REFUND_TO_CUSTOMER' ? 'Hoàn tiền khách' : 'Giữ tiền vendor',
      danger: action === 'RELEASE_TO_VENDOR',
    });
  };

  const confirmFinalVerdict = async () => {
    if (!verdictConfirm) return;
    await applyFinalVerdict(verdictConfirm.id, verdictConfirm.action);
    setVerdictConfirm(null);
  };

  return (
    <AdminLayout title="Hoàn trả" breadcrumbs={['Đơn hàng', 'Hoàn trả & Tranh chấp']}>
      <PanelStatsGrid
        items={[
          {
            key: 'disputed',
            label: 'Cần trọng tài',
            value: tabCounts.disputed,
            sub: 'Case cần phán quyết cuối',
            tone: tabCounts.disputed > 0 ? 'danger' : 'info',
            onClick: () => changeTab('disputed'),
          },
          {
            key: 'pendingVendor',
            label: 'Chờ vendor',
            value: tabCounts.pendingVendor,
            sub: 'Vendor chưa phản hồi',
            tone: tabCounts.pendingVendor > 0 ? 'warning' : '',
            onClick: () => changeTab('pendingVendor'),
          },
          {
            key: 'inProgress',
            label: 'Đang xử lý',
            value: tabCounts.inProgress,
            sub: 'Đang vận chuyển/kiểm hàng',
            tone: 'info',
            onClick: () => changeTab('inProgress'),
          },
          {
            key: 'completed',
            label: 'Đã hoàn tiền',
            value: tabCounts.completed,
            sub: 'Yêu cầu đã đóng',
            tone: 'success',
            onClick: () => changeTab('completed'),
          },
        ]}
      />

      <section className="admin-panels single">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Danh sách yêu cầu hoàn trả</h2>
            <div className="admin-actions">
              {tabCounts.disputed > 0 && (
                <span className="admin-pill error">
                  <ShieldAlert size={14} />
                  {tabCounts.disputed} tranh chấp chờ phán quyết
                </span>
              )}
            </div>
          </div>
          <div className="admin-filter-toolbar">
            <PanelSearchField
              placeholder="Tìm mã hoàn trả, đơn hàng, khách hàng hoặc gian hàng"
              ariaLabel="Tìm yêu cầu hoàn trả"
              value={view.search}
              onChange={changeSearch}
            />
            <PanelFilterSelect
              label="Trạng thái"
              ariaLabel="Lọc yêu cầu hoàn trả theo trạng thái"
              items={TABS.map((tab) => ({
                key: tab.key,
                label: tab.label,
                count: tabCounts[tab.key],
              }))}
              value={activeTab}
              onChange={changeTab}
            />
            {view.hasViewContext ? (
              <button type="button" className="admin-filter-reset" onClick={resetCurrentView}>
                Đặt lại
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <AdminStateBlock
              type="empty"
              title="Đang tải danh sách hoàn trả"
              description="Hệ thống đang đồng bộ dữ liệu yêu cầu đổi trả."
            />
          ) : loadError ? (
            <AdminStateBlock
              type="error"
              title="Không tải được danh sách yêu cầu hoàn trả"
              description={loadError}
              actionLabel="Thử lại"
              onAction={() => void fetchPageData()}
            />
          ) : rows.length === 0 ? (
            <AdminStateBlock
              type="empty"
              title="Chưa có yêu cầu hoàn trả"
              description="Khi khách gửi yêu cầu đổi trả, danh sách sẽ xuất hiện tại đây."
              actionLabel="Đặt lại"
              onAction={resetCurrentView}
            />
          ) : (
            <>
              <div className="admin-table admin-responsive-table" role="table" aria-label="Bảng yêu cầu hoàn trả">
                <div className="admin-table-row admin-table-head returns-row returns-grid" role="row">
                  <div role="columnheader" className="returns-checkbox-cell">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả"
                      checked={selected.size === rows.length && rows.length > 0}
                      onChange={(event) => {
                        setSelected(event.target.checked ? new Set(rows.map((item) => item.id)) : new Set());
                      }}
                    />
                  </div>
                  <div role="columnheader">STT</div>
                  <div role="columnheader">Khách hàng</div>
                  <div role="columnheader">Sản phẩm</div>
                  <div role="columnheader">Trạng thái</div>
                  <div role="columnheader">Giá trị</div>
                  <div role="columnheader">Hành động</div>
                </div>

                {rows.map((item, index) => (
                  <motion.div
                    key={item.id}
                    className={`admin-table-row returns-row returns-grid ${item.status === 'DISPUTING' ? 'returns-row-disputed' : ''}`}
                    role="row"
                    whileHover={{ y: -1 }}
                    onClick={() => setDrawerItem(item)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div role="cell" className="returns-checkbox-cell" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(event) => {
                          const next = new Set(selected);
                          if (event.target.checked) next.add(item.id);
                          else next.delete(item.id);
                          setSelected(next);
                        }}
                        aria-label={`Chọn ${toDisplayReturnCode(item.code)}`}
                      />
                    </div>
                    <div role="cell">
                      <span className="returns-ellipsis" style={{ fontSize: '12px', fontWeight: 700 }}>{(safePage - 1) * PAGE_SIZE + index + 1}</span>
                    </div>
                    <div role="cell" className="returns-customer-cell" title={item.customerName}>
                      <div className="returns-customer-cell-content">
                        <div
                          className="returns-customer-avatar"
                        >
                          {getInitials(item.customerName)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span className="returns-ellipsis" style={{ fontSize: '12px', fontWeight: 700 }}>{item.customerName}</span>
                          <small className="admin-muted returns-ellipsis" style={{ fontSize: '11px' }}>{item.customerEmail || 'Chưa có email'}</small>
                        </div>
                      </div>
                    </div>
                    <div role="cell" className="returns-product-cell" title={item.items.map((i) => i.productName).join(', ')}>
                      {item.items[0]?.imageUrl ? (
                        <img src={item.items[0].imageUrl} alt={item.items[0].productName} className="returns-product-thumb" />
                      ) : (
                        <div className="returns-product-thumb placeholder">SP</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span className="returns-ellipsis" style={{ fontSize: '12px', fontWeight: 700 }}>
                          {item.items.map((product) => `${product.productName} (x${product.quantity})`).join(', ')}
                        </span>
                        {item.items[0]?.variantName ? (
                          <small className="admin-muted returns-ellipsis" style={{ fontSize: '11px' }}>
                            {item.items[0].variantName}
                          </small>
                        ) : null}
                      </div>
                    </div>
                    <div role="cell">
                      <span className={statusConfig[item.status].pillClass}>{statusConfig[item.status].label}</span>
                    </div>
                    <div role="cell" className="returns-amount">
                      {formatVnd(getReturnAmount(item))}
                    </div>
                    <div role="cell" className="admin-actions returns-actions" onClick={(event) => event.stopPropagation()}>
                      <button className="admin-icon-btn subtle" title="Xem chi tiết" onClick={() => setDrawerItem(item)}>
                        <Eye size={16} />
                      </button>
                      {item.status === 'DISPUTING' && (
                        <>
                          <button
                            className="admin-icon-btn subtle danger-icon"
                            title="Hoàn tiền cho khách"
                            disabled={actionLoading}
                            onClick={() => openVerdictConfirm(item, 'REFUND_TO_CUSTOMER')}
                          >
                            <XCircle size={16} />
                          </button>
                          <button
                            className="admin-icon-btn subtle success-icon"
                            title="Giữ tiền cho vendor"
                            disabled={actionLoading}
                            onClick={() => openVerdictConfirm(item, 'RELEASE_TO_VENDOR')}
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="admin-mobile-cards" aria-label="Danh sách hoàn trả dạng thẻ">
                {rows.map((item) => (
                  <article key={item.id} className="admin-mobile-card">
                    <div className="admin-mobile-card-head">
                      <div className="admin-mobile-card-title">
                        <div className="admin-mobile-card-title-main">
                          <p className="admin-bold">{toDisplayReturnCode(item.code)}</p>
                          <p className="admin-mobile-card-sub">Đơn #{toDisplayOrderCode(item.orderCode)}</p>
                        </div>
                      </div>
                      <span className={statusConfig[item.status].pillClass}>{statusConfig[item.status].label}</span>
                    </div>
                    <div className="admin-mobile-card-grid">
                      <div className="admin-mobile-card-field">
                        <span>Khách hàng</span>
                        <strong>{item.customerName}</strong>
                        <p>{item.customerEmail || 'Chưa có email'}</p>
                      </div>
                      <div className="admin-mobile-card-field">
                        <span>Gian hàng</span>
                        <strong>{item.storeName || 'Chưa xác định'}</strong>
                      </div>
                      <div className="admin-mobile-card-field">
                        <span>Sản phẩm</span>
                        <strong>{item.items.map((product) => `${product.productName} (x${product.quantity})`).join(', ')}</strong>
                      </div>
                      <div className="admin-mobile-card-field">
                        <span>Giá trị</span>
                        <strong>{formatVnd(getReturnAmount(item))}</strong>
                      </div>
                    </div>
                    <div className="admin-mobile-card-actions">
                      <button className="admin-primary-btn" type="button" onClick={() => setDrawerItem(item)}>
                        <Eye size={16} />
                        Xem chi tiết
                      </button>
                      {item.status === 'DISPUTING' && (
                        <>
                          <button
                            className="admin-icon-btn subtle danger-icon"
                            title="Hoàn tiền cho khách"
                            aria-label="Hoàn tiền cho khách"
                            disabled={actionLoading}
                            onClick={() => openVerdictConfirm(item, 'REFUND_TO_CUSTOMER')}
                          >
                            <XCircle size={16} />
                          </button>
                          <button
                            className="admin-icon-btn subtle success-icon"
                            title="Giữ tiền cho vendor"
                            aria-label="Giữ tiền cho vendor"
                            disabled={actionLoading}
                            onClick={() => openVerdictConfirm(item, 'RELEASE_TO_VENDOR')}
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <PanelTableFooter
                meta={`Hiển thị ${startIndex}-${endIndex} trên ${totalElements} yêu cầu`}
                page={safePage}
                totalPages={totalPages}
                onPageChange={view.setPage}
                prevLabel="Trước"
                nextLabel="Sau"
              />
            </>
          )}
        </div>
      </section>

      <Drawer
        open={Boolean(drawerItem)}
        onClose={() => {
          setDrawerItem(null);
          setDrawerNote('');
        }}
        className="returns-drawer"
        size="lg"
        ariaLabel="Chi tiết yêu cầu hoàn trả"
      >
        {drawerItem ? (
          <>
            <PanelDrawerHeader
              eyebrow={drawerItem.status === 'DISPUTING' ? 'Tranh chấp cần phán quyết' : 'Yêu cầu hoàn trả'}
              title={toDisplayReturnCode(drawerItem.code)}
              onClose={() => {
                setDrawerItem(null);
                setDrawerNote('');
              }}
              closeLabel="Đóng chi tiết hoàn trả"
            />

            <div className="drawer-body">
              <PanelDrawerSection title="Tổng quan yêu cầu">
                <div className="returns-drawer-hero" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '16px' }}>
                  <div
                    className="returns-customer-avatar large"
                  >
                    {getInitials(drawerItem.customerName)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div className="admin-bold" style={{ fontSize: '15px', color: '#0f172a' }}>{drawerItem.customerName}</div>
                    <div className="admin-muted" style={{ fontSize: '12px' }}>{drawerItem.customerEmail || 'Chưa có email'}</div>
                  </div>
                  <div className="returns-hero-pills" style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <span className={statusConfig[drawerItem.status].pillClass}>
                      {statusConfig[drawerItem.status].label}
                    </span>
                    <span className="admin-pill neutral">
                      {resolutionLabel[drawerItem.resolution] || drawerItem.resolution}
                    </span>
                  </div>
                </div>

                <div className="returns-meta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                  <article className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Mã đơn hàng</span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>#{toDisplayOrderCode(drawerItem.orderCode)}</strong>
                  </article>
                  <article className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Số điện thoại khách</span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{drawerItem.customerPhone || 'Chưa có số điện thoại'}</strong>
                  </article>
                  <article className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Gian hàng</span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{drawerItem.storeName || 'Không rõ'}</strong>
                  </article>
                  <article className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Giá trị hoàn tiền</span>
                    <strong style={{ fontSize: '14px', color: '#0d9488', fontWeight: 800 }}>{formatVnd(drawerRefundTotal)}</strong>
                  </article>
                  <article className="returns-meta-card" style={{ gridColumn: 'span 2', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Thời điểm tạo yêu cầu</span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{formatDateTime(drawerItem.createdAt)}</strong>
                  </article>
                </div>
              </PanelDrawerSection>

              {drawerItem.items.length > 0 && (
                <PanelDrawerSection title={`Sản phẩm trả lại (${drawerItemCount})`}>
                  <div className="returns-items-list">
                    {drawerItem.items.map((item) => (
                      <article key={item.orderItemId} className="returns-item-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'stretch', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.productName} className="returns-item-image" style={{ width: '64px', height: '64px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div className="returns-item-image placeholder" style={{ width: '64px', height: '64px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#94a3b8', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>SP</div>
                          )}
                          <div className="returns-item-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                            <strong className="returns-item-name returns-ellipsis" style={{ fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>{item.productName}</strong>
                            {item.variantName ? (
                              <small className="admin-muted" style={{ fontSize: '11px', color: '#64748b' }}>{item.variantName}</small>
                            ) : null}
                            <div className="returns-item-meta" style={{ display: 'flex', gap: '16px', fontSize: '13px', marginTop: '6px' }}>
                              <span style={{ color: '#64748b' }}>Số lượng: <strong>x{item.quantity}</strong></span>
                              <span style={{ color: '#64748b' }}>Đơn giá: <strong>{formatVnd(item.unitPrice)}</strong></span>
                            </div>
                          </div>
                        </div>
                        {item.evidenceUrl ? (
                          <div style={{ marginTop: '6px', borderTop: '1px dashed #e2e8f0', paddingTop: '10px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '8px' }}>
                              Ảnh minh chứng sản phẩm (bấm để xem lớn):
                            </span>
                            <div
                              onClick={() => setActiveEnlargedImage(resolveEvidenceUrl(item.evidenceUrl))}
                              style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                border: '1px solid #cbd5e1',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              className="returns-evidence-thumbnail-hover"
                            >
                              <img
                                src={resolveEvidenceUrl(item.evidenceUrl)}
                                alt="Product Evidence Thumbnail"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </PanelDrawerSection>
              )}


              <PanelDrawerSection title="Khách hàng khiếu nại">
                <div className="returns-reason-box" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="admin-card-row" style={{ display: 'block', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', lineHeight: '1.6' }}>
                    <span className="admin-bold" style={{ fontWeight: 700, color: '#0f172a', marginRight: '6px', fontSize: '13px' }}>Lý do từ khách hàng:</span>
                    <span className="admin-muted" style={{ color: '#475569', fontSize: '13px' }}>{reasonLabel[drawerItem.reason] || drawerItem.reason}</span>
                  </div>
                  <div className="admin-card-row" style={{ display: 'block', lineHeight: '1.6' }}>
                    <span className="admin-bold" style={{ fontWeight: 700, color: '#0f172a', marginRight: '6px', fontSize: '13px' }}>Ghi chú bổ sung từ khách:</span>
                    <span className="admin-muted" style={{ color: '#475569', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{drawerItem.note?.trim() || 'Không có ghi chú bổ sung'}</span>
                  </div>

                  {drawerItem.items.some((item) => item.evidenceUrl) && (
                    <div style={{ marginTop: '4px', borderTop: '1px dashed #cbd5e1', paddingTop: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>
                        Ảnh minh chứng của khách hàng (bấm để xem lớn):
                      </span>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {drawerItem.items.map((item, idx) =>
                          item.evidenceUrl ? (
                            <div
                              key={idx}
                              onClick={() => setActiveEnlargedImage(resolveEvidenceUrl(item.evidenceUrl))}
                              style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                border: '1px solid #cbd5e1',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              className="returns-evidence-thumbnail-hover"
                            >
                              <img
                                src={resolveEvidenceUrl(item.evidenceUrl)}
                                alt="Customer Evidence Thumbnail"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                }}
                              />
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </PanelDrawerSection>

              {(drawerItem.vendorReason || drawerItem.disputeReason || drawerItem.disputeEvidenceUrl) && (
                <PanelDrawerSection title="Vendor phản hồi & Tố cáo">
                  <div className="returns-reason-box" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {drawerItem.vendorReason && (
                      <div className="admin-card-row" style={{ display: 'block', lineHeight: '1.6', borderBottom: (drawerItem.disputeReason || drawerItem.disputeEvidenceUrl) ? '1px solid #e2e8f0' : 'none', paddingBottom: (drawerItem.disputeReason || drawerItem.disputeEvidenceUrl) ? '8px' : '0' }}>
                        <span className="admin-bold" style={{ fontWeight: 700, color: '#0f172a', marginRight: '6px', fontSize: '13px' }}>Lý do từ chối từ vendor:</span>
                        <span className="admin-muted" style={{ color: '#475569', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{drawerItem.vendorReason}</span>
                      </div>
                    )}
                    {drawerItem.disputeReason && (
                      <div className="admin-card-row" style={{ display: 'block', lineHeight: '1.6' }}>
                        <span className="admin-bold" style={{ fontWeight: 700, color: '#0f172a', marginRight: '6px', fontSize: '13px' }}>Lý do tố cáo từ vendor:</span>
                        <span className="admin-muted" style={{ color: '#475569', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{drawerItem.disputeReason}</span>
                      </div>
                    )}

                    {drawerItem.disputeEvidenceUrl && (
                      <div style={{ marginTop: '4px', borderTop: '1px dashed #cbd5e1', paddingTop: '10px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>
                          Ảnh minh chứng tố cáo từ vendor (bấm để xem lớn):
                        </span>
                        <div
                          onClick={() => setActiveEnlargedImage(resolveEvidenceUrl(drawerItem.disputeEvidenceUrl))}
                          style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: '1px solid #cbd5e1',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          className="returns-evidence-thumbnail-hover"
                        >
                          <img
                            src={resolveEvidenceUrl(drawerItem.disputeEvidenceUrl)}
                            alt="Vendor Evidence Thumbnail"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </PanelDrawerSection>
              )}



              <PanelDrawerSection title="Ghi chú trọng tài">
                <div className="returns-note-box" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '12px', marginBottom: '14px' }}>
                  <p className="returns-note-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: '#b45309', fontWeight: 700, margin: '0 0 4px' }}>Ghi chú phiên trọng tài hiện tại</p>
                  <p className="returns-note-text" style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>{drawerItem.adminNote?.trim() || 'Hệ thống chưa ghi nhận phán quyết bằng văn bản cho phiên này.'}</p>
                </div>
                <div className="returns-note-input-wrap">
                  <label htmlFor="admin-return-note" className="returns-note-label">
                    Cập nhật ghi chú mới
                  </label>
                  <textarea
                    id="admin-return-note"
                    value={drawerNote}
                    onChange={(event) => setDrawerNote(event.target.value)}
                    rows={4}
                    placeholder="Nhập ghi chú cho phán quyết cuối cùng..."
                    className="returns-note-input"
                  />
                </div>
              </PanelDrawerSection>
            </div>

            <PanelDrawerFooter>
              <button
                className="admin-ghost-btn"
                onClick={() => {
                  setDrawerItem(null);
                  setDrawerNote('');
                }}
              >
                Đóng
              </button>

              {drawerItem.status === 'DISPUTING' && (
                <>
                  <button
                    className="admin-ghost-btn danger"
                    disabled={actionLoading}
                    onClick={() => openVerdictConfirm(drawerItem, 'REFUND_TO_CUSTOMER')}
                  >
                    <XCircle size={14} />
                    Hoàn tiền khách
                  </button>
                  <button
                    className="admin-primary-btn"
                    disabled={actionLoading}
                    onClick={() => openVerdictConfirm(drawerItem, 'RELEASE_TO_VENDOR')}
                  >
                    <CheckCircle2 size={14} />
                    Giữ tiền vendor
                  </button>
                </>
              )}
            </PanelDrawerFooter>
          </>
        ) : null}
      </Drawer>
      {activeEnlargedImage && createPortal(
        <div
          className="admin-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            cursor: 'zoom-out',
          }}
          onClick={() => setActiveEnlargedImage(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveEnlargedImage(null)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'rgba(15, 23, 42, 0.75)',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                borderRadius: '50%',
                zIndex: 100000,
              }}
              aria-label="Đóng ảnh phóng to"
            >
              <X size={20} />
            </button>
            <img
              src={activeEnlargedImage}
              alt="Phóng to ảnh minh chứng"
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                borderRadius: '12px',
                objectFit: 'contain',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
              }}
            />
          </div>
        </div>,
        document.body
      )}

      <AdminConfirmDialog
        open={Boolean(verdictConfirm)}
        title="Xác nhận phán quyết hoàn trả"
        description={
          verdictConfirm?.action === 'REFUND_TO_CUSTOMER'
            ? 'Khoản tiền sẽ được hoàn cho khách hàng và case tranh chấp được đóng.'
            : 'Khoản tiền sẽ được giữ cho vendor và case tranh chấp được đóng.'
        }
        selectedItems={verdictConfirm ? [verdictConfirm.code] : undefined}
        selectedNoun="yêu cầu"
        confirmLabel={actionLoading ? 'Đang xử lý...' : verdictConfirm?.label}
        danger={verdictConfirm?.danger}
        confirmDisabled={actionLoading}
        cancelDisabled={actionLoading}
        onCancel={() => setVerdictConfirm(null)}
        onConfirm={() => void confirmFinalVerdict()}
      />
    </AdminLayout>
  );
};

export default AdminReturns;


