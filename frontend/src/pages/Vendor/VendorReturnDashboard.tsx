import './Vendor.css';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Eye, PackageCheck, ShieldCheck, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import VendorLayout from './VendorLayout';
import { AdminStateBlock } from '../Admin/AdminStateBlocks';
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
import { returnService, type ReturnRequest, type ReturnStatus } from '../../services/returnService';
import { useToast } from '../../contexts/ToastContext';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { toDisplayOrderCode, toDisplayReturnCode } from '../../utils/displayCode';
import { normalizePositiveInteger } from './vendorHelpers';

type VendorReturnTab = 'all' | 'needsAction' | 'inTransit' | 'toInspect' | 'disputed';

const PAGE_SIZE = 10;

const TABS: Array<{ key: VendorReturnTab; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'needsAction', label: 'Cần xử lý' },
  { key: 'inTransit', label: 'Đang hoàn gửi' },
  { key: 'toInspect', label: 'Chờ kiểm hàng' },
  { key: 'disputed', label: 'Tranh chấp' },
];

const normalizeTab = (value: string | null): VendorReturnTab => {
  if (value === 'needsAction' || value === 'inTransit' || value === 'toInspect' || value === 'disputed') {
    return value;
  }

  return 'all';
};

const statusConfig: Record<ReturnRequest['status'], { label: string; className: string }> = {
  PENDING_VENDOR: { label: 'Chờ phản hồi', className: 'admin-pill pending' },
  ACCEPTED: { label: 'Đã chấp nhận', className: 'admin-pill neutral' },
  SHIPPING: { label: 'Đang hoàn gửi', className: 'admin-pill neutral' },
  RECEIVED: { label: 'Đã nhận hàng hoàn', className: 'admin-pill warning' },
  COMPLETED: { label: 'Đã hoàn tiền', className: 'admin-pill success' },
  REJECTED: { label: 'Từ chối', className: 'admin-pill error' },
  DISPUTED: { label: 'Tranh chấp', className: 'admin-pill error' },
  CANCELLED: { label: 'Đã hủy', className: 'admin-pill neutral' },
};

const reasonLabel: Record<string, string> = {
  SIZE: 'Sai kích cỡ',
  DEFECT: 'Lỗi sản phẩm',
  CHANGE: 'Nhu cầu đổi',
  OTHER: 'Lý do khác',
};

const TAB_STATUS_MAP: Record<VendorReturnTab, ReturnStatus[] | undefined> = {
  all: undefined,
  needsAction: ['PENDING_VENDOR', 'RECEIVED'],
  inTransit: ['SHIPPING'],
  toInspect: ['RECEIVED'],
  disputed: ['DISPUTED'],
};

type VendorTabCounts = Record<VendorReturnTab, number>;

const EMPTY_COUNTS: VendorTabCounts = {
  all: 0,
  needsAction: 0,
  inTransit: 0,
  toInspect: 0,
  disputed: 0,
};

const formatVnd = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value || 0);

const getRefundAmount = (request: ReturnRequest) => {
  if (typeof request.refundAmount === 'number') return request.refundAmount;
  return request.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
};

const formatDate = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const VendorReturnDashboard = () => {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = normalizeTab(searchParams.get('status'));
  const page = normalizePositiveInteger(searchParams.get('page'));
  const keyword = (searchParams.get('q') || '').trim();

  const [rows, setRows] = useState<ReturnRequest[]>([]);
  const [tabCounts, setTabCounts] = useState<VendorTabCounts>(EMPTY_COUNTS);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(keyword);
  const [detailItem, setDetailItem] = useState<ReturnRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const setTab = useCallback((tab: VendorReturnTab) => {
    setSelected(new Set());
    updateQuery((query) => {
      if (tab === 'all') {
        query.delete('status');
      } else {
        query.set('status', tab);
      }
      query.set('page', '1');
    });
  }, [updateQuery]);

  const setPage = useCallback((nextPage: number) => {
    updateQuery((query) => {
      query.set('page', String(Math.max(1, nextPage)));
    });
  }, [updateQuery]);

  const resetCurrentView = useCallback(() => {
    setSelected(new Set());
    setSearchQuery('');
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const fetchTabCounts = useCallback(async () => {
    try {
      const summary = await returnService.getVendorSummary();
      setTabCounts({
        all: Number(summary.all || 0),
        needsAction: Number(summary.needsAction || 0),
        inTransit: Number(summary.inTransit || 0),
        toInspect: Number(summary.toInspect || 0),
        disputed: Number(summary.disputed || 0),
      });
    } catch {
      // Keep current counts when stats request fails.
    }
  }, []);

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

  const fetchPageData = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const response = await returnService.listVendor({
        statuses: TAB_STATUS_MAP[activeTab],
        q: keyword || undefined,
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
      setLoadError(getUiErrorMessage(error, 'Không tải được danh sách hoàn trả của gian hàng.'));
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, keyword, page]);

  useEffect(() => {
    void fetchTabCounts();
  }, [fetchTabCounts]);

  useEffect(() => {
    void fetchPageData();
  }, [fetchPageData]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, setPage, totalPages]);

  const safePage = Math.min(page, totalPages);
  const startIndex = totalElements === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(totalElements, safePage * PAGE_SIZE);
  const statusItems = TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: tabCounts[tab.key],
  }));
  const hasViewContext = activeTab !== 'all' || Boolean(keyword);

  const handleAccept = async (request: ReturnRequest) => {
    try {
      setActionLoading(true);
      const updated = await returnService.acceptByVendor(request.id);
      setDetailItem((current) => (current?.id === updated.id ? updated : current));
      await Promise.all([fetchPageData(), fetchTabCounts()]);
      addToast(`Đã chấp nhận yêu cầu ${toDisplayReturnCode(updated.code)}.`, 'success');
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể chấp nhận yêu cầu hoàn trả.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (request: ReturnRequest, reason: string) => {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      addToast('Vui lòng nhập lý do từ chối.', 'error');
      return;
    }

    try {
      setActionLoading(true);
      const updated = await returnService.rejectByVendor(request.id, normalizedReason);
      setDetailItem((current) => (current?.id === updated.id ? updated : current));
      await Promise.all([fetchPageData(), fetchTabCounts()]);
      setRejectReason('');
      addToast(`Đã từ chối yêu cầu ${toDisplayReturnCode(updated.code)}.`, 'success');
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể từ chối yêu cầu hoàn trả.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkReceived = async (request: ReturnRequest) => {
    try {
      setActionLoading(true);
      const updated = await returnService.markReceivedByVendor(request.id);
      setDetailItem((current) => (current?.id === updated.id ? updated : current));
      await Promise.all([fetchPageData(), fetchTabCounts()]);
      addToast(`Đã xác nhận nhận hàng hoàn ${toDisplayReturnCode(updated.code)}.`, 'success');
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể xác nhận nhận hàng hoàn.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmRefund = async (request: ReturnRequest) => {
    try {
      setActionLoading(true);
      const updated = await returnService.confirmRefundByVendor(request.id);
      setDetailItem((current) => (current?.id === updated.id ? updated : current));
      await Promise.all([fetchPageData(), fetchTabCounts()]);
      addToast(`Đã xác nhận hoàn tiền cho ${toDisplayReturnCode(updated.code)}.`, 'success');
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể hoàn tất hoàn tiền.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <VendorLayout title="Hoàn trả" breadcrumbs={['Kênh Người Bán', 'Hoàn trả']}>
      <PanelStatsGrid
        items={[
          {
            key: 'needs-action',
            label: 'Cần xử lý',
            value: tabCounts.needsAction,
            sub: 'Yêu cầu cần vendor ra quyết định',
            tone: tabCounts.needsAction > 0 ? 'warning' : '',
            onClick: () => setTab('needsAction'),
          },
          {
            key: 'in-transit',
            label: 'Đang hoàn gửi',
            value: tabCounts.inTransit,
            sub: 'Khách đã gửi hàng',
            tone: 'info',
            onClick: () => setTab('inTransit'),
          },
          {
            key: 'to-inspect',
            label: 'Chờ kiểm hàng',
            value: tabCounts.toInspect,
            sub: 'Đã nhận hàng, chờ hoàn tiền',
            tone: tabCounts.toInspect > 0 ? 'warning' : 'info',
            onClick: () => setTab('toInspect'),
          },
          {
            key: 'disputed',
            label: 'Tranh chấp',
            value: tabCounts.disputed,
            sub: 'Đã chuyển admin trọng tài',
            tone: tabCounts.disputed > 0 ? 'danger' : '',
            onClick: () => setTab('disputed'),
          },
        ]}
      />

      <div className="admin-filter-toolbar vendor-filter-toolbar">
        <PanelSearchField
          placeholder="Tìm theo khách hàng, email, mã trả hàng..."
          ariaLabel="Tìm yêu cầu hoàn trả"
          value={searchQuery}
          onChange={setSearchQuery}
        />
        <PanelFilterSelect
          label="Trạng thái"
          ariaLabel="Lọc hoàn trả theo trạng thái"
          items={statusItems}
          value={activeTab}
          onChange={(key) => setTab(key as VendorReturnTab)}
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
            <h2>Danh sách yêu cầu hoàn trả</h2>
          </div>

          {isLoading ? (
            <AdminStateBlock
              type="empty"
              title="Đang tải yêu cầu hoàn trả"
              description="Hệ thống đang đồng bộ dữ liệu hoàn trả của gian hàng."
            />
          ) : loadError ? (
            <AdminStateBlock
              type="error"
              title="Không tải được danh sách hoàn trả"
              description={loadError}
              actionLabel="Thử lại"
              onAction={() => void fetchPageData()}
            />
          ) : rows.length === 0 ? (
            <AdminStateBlock
              type={hasViewContext ? 'search-empty' : 'empty'}
              title={hasViewContext ? 'Không có yêu cầu hoàn trả phù hợp' : 'Chưa có yêu cầu hoàn trả'}
              description={hasViewContext ? 'Thử đổi từ khóa hoặc trạng thái để xem lại hàng đợi hoàn trả.' : 'Khi khách gửi yêu cầu đổi trả, dữ liệu sẽ hiển thị ở đây.'}
              actionLabel={hasViewContext ? 'Đặt lại bộ lọc' : undefined}
              onAction={hasViewContext ? resetCurrentView : undefined}
            />
          ) : (
            <>
              <div className="admin-table vendor-table" role="table" aria-label="Bảng hoàn trả vendor">
                <div className="admin-table-row admin-table-head vendor-returns" role="row">
                  <div role="columnheader" className="vendor-return-checkbox-head">
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
                  <div role="columnheader">Lý do</div>
                  <div role="columnheader">Trạng thái</div>
                  <div role="columnheader">Giá trị</div>
                  <div role="columnheader">Hành động</div>
                </div>

                {rows.map((item, index) => {
                  const firstReturnItem = item.items[0];
                  const productName = firstReturnItem?.productName || 'Sản phẩm hoàn trả';
                  const productImage = firstReturnItem?.imageUrl || '/images/placeholder-product.svg';
                  const variantName = firstReturnItem?.variantName?.trim() || 'Chưa có biến thể';
                  const totalQuantity = item.items.reduce((sum, returnItem) => sum + returnItem.quantity, 0);
                  const reasonText = reasonLabel[item.reason] || item.reason;
                  const productMeta = `${variantName} · Số lượng: ${totalQuantity}`;
                  const extraItemCount = Math.max(0, item.items.length - 1);

                  return (
                    <motion.div key={item.id} className="admin-table-row vendor-returns" role="row" whileHover={{ y: -1 }}>
                      <div role="cell" className="vendor-return-checkbox-cell">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={(event) => {
                            const next = new Set(selected);
                            if (event.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            setSelected(next);
                          }}
                          aria-label={`Chọn ${toDisplayReturnCode(item.code)}`}
                        />
                      </div>
                      <div role="cell" className="admin-mono">{startIndex + index}</div>
                      <div role="cell" className="returns-customer-cell">
                        <strong className="returns-ellipsis">{item.customerName || 'Khách hàng'}</strong>
                        <small className="admin-muted returns-ellipsis">{item.customerEmail || 'Chưa có email'}</small>
                      </div>
                      <div role="cell" className="returns-product-cell">
                        <img
                          src={productImage}
                          alt={productName}
                          className="returns-product-thumb"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="returns-product-copy">
                          <strong className="returns-product-name returns-ellipsis" title={productName}>
                            {productName}
                          </strong>
                          <small className="admin-muted returns-product-meta returns-ellipsis" title={productMeta}>
                            {productMeta}
                          </small>
                          {extraItemCount > 0 ? (
                            <small className="returns-product-extra">+{extraItemCount} sản phẩm khác</small>
                          ) : null}
                        </div>
                      </div>
                      <div role="cell" className="returns-reason-cell">
                        <span style={{ fontSize: '13.5px', color: 'var(--co-admin-text)', fontWeight: 500 }}>
                          {reasonText}
                        </span>
                      </div>
                      <div role="cell">
                        <span className={statusConfig[item.status].className}>{statusConfig[item.status].label}</span>
                      </div>
                      <div role="cell" className="returns-amount">
                        {formatVnd(getRefundAmount(item))}
                      </div>
                      <div role="cell" className="admin-actions vendor-return-actions">
                        {item.status === 'PENDING_VENDOR' && (
                          <>
                            <button
                              className="admin-icon-btn subtle"
                              title="Chấp nhận"
                              onClick={() => void handleAccept(item)}
                              disabled={actionLoading}
                            >
                              <ShieldCheck size={16} />
                            </button>
                            <button
                              className="admin-icon-btn subtle danger-icon"
                              title="Từ chối"
                              onClick={() => setDetailItem(item)}
                              disabled={actionLoading}
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                        {item.status === 'SHIPPING' && (
                          <button
                            className="admin-icon-btn subtle"
                            title="Xác nhận đã nhận hàng hoàn"
                            onClick={() => void handleMarkReceived(item)}
                            disabled={actionLoading}
                          >
                            <PackageCheck size={16} />
                          </button>
                        )}
                        {item.status === 'RECEIVED' && (
                          <button
                            className="admin-icon-btn subtle"
                            title="Xác nhận hoàn tiền"
                            onClick={() => void handleConfirmRefund(item)}
                            disabled={actionLoading}
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        <button className="admin-icon-btn subtle" title="Xem chi tiết" onClick={() => setDetailItem(item)}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <PanelTableFooter
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
                meta={`Hiển thị ${startIndex}-${endIndex} / ${totalElements} yêu cầu`}
              />
            </>
          )}
        </div>
      </section>

      <Drawer
        open={Boolean(detailItem)}
        onClose={() => {
          setDetailItem(null);
          setRejectReason('');
        }}
        className="returns-drawer"
      >
        {detailItem ? (
          <>
            <PanelDrawerHeader
              eyebrow="Chi tiết hoàn trả"
              title={toDisplayReturnCode(detailItem.code)}
              onClose={() => {
                setDetailItem(null);
                setRejectReason('');
              }}
              closeLabel="Đóng chi tiết"
            />

            <div className="drawer-body">
              <PanelDrawerSection title="Thông tin tổng quan">
                <div className="returns-meta-grid">
                  <article className="returns-meta-card">
                    <span className="returns-meta-label">Mã đơn</span>
                    <strong>#{toDisplayOrderCode(detailItem.orderCode)}</strong>
                  </article>
                  <article className="returns-meta-card">
                    <span className="returns-meta-label">Khách hàng</span>
                    <strong>{detailItem.customerName}</strong>
                    <small className="admin-muted">{detailItem.customerEmail || 'Chưa có email'}</small>
                  </article>
                  <article className="returns-meta-card">
                    <span className="returns-meta-label">Trạng thái</span>
                    <strong>{statusConfig[detailItem.status].label}</strong>
                    <small className="admin-muted">{formatDate(detailItem.updatedAt)}</small>
                  </article>
                  <article className="returns-meta-card">
                    <span className="returns-meta-label">Giá trị</span>
                    <strong>{formatVnd(getRefundAmount(detailItem))}</strong>
                    <small className="admin-muted">Hình thức: {detailItem.resolution}</small>
                  </article>
                </div>
              </PanelDrawerSection>

              <PanelDrawerSection title="Lý do yêu cầu">
                <div className="returns-reason-box">
                  <p className="returns-note-text">{reasonLabel[detailItem.reason] || detailItem.reason}</p>
                  <p className="returns-note-text">{detailItem.note?.trim() || 'Không có ghi chú thêm từ khách.'}</p>
                  {detailItem.disputeReason ? (
                    <p className="returns-note-text">Lý do tranh chấp: {detailItem.disputeReason}</p>
                  ) : null}
                </div>
              </PanelDrawerSection>

              <PanelDrawerSection title={`Sản phẩm hoàn trả (${detailItem.items.length})`}>
                <div className="returns-items-list">
                  {detailItem.items.map((item) => (
                    <article key={item.orderItemId} className="returns-item-card">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.productName} className="returns-item-image" />
                      ) : (
                        <div className="returns-item-image placeholder">SP</div>
                      )}
                      <div className="returns-item-content">
                        <strong className="returns-item-name">{item.productName}</strong>
                        <small className="admin-muted">{item.variantName || 'Biến thể mặc định'}</small>
                        <div className="returns-item-meta">
                          <span>x{item.quantity}</span>
                          <span>{formatVnd(item.unitPrice)}</span>
                          <span className="admin-bold">{formatVnd(item.unitPrice * item.quantity)}</span>
                        </div>
                        {item.evidenceUrl ? (
                          <a className="admin-link" href={item.evidenceUrl} target="_blank" rel="noreferrer">
                            Xem file evidence
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </PanelDrawerSection>

              {detailItem.status === 'PENDING_VENDOR' ? (
                <PanelDrawerSection title="Lý do từ chối (nếu từ chối)">
                  <div className="returns-note-input-wrap">
                    <textarea
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      rows={4}
                      placeholder="Nhập lý do từ chối để gửi khách hàng..."
                      className="returns-note-input"
                    />
                  </div>
                </PanelDrawerSection>
              ) : null}
            </div>

            <PanelDrawerFooter>
              <button
                className="admin-ghost-btn"
                onClick={() => {
                  setDetailItem(null);
                  setRejectReason('');
                }}
              >
                Đóng
              </button>

              {detailItem.status === 'PENDING_VENDOR' && (
                <>
                  <button
                    className="admin-ghost-btn danger"
                    disabled={actionLoading}
                    onClick={() => void handleReject(detailItem, rejectReason)}
                  >
                    <XCircle size={14} />
                    Từ chối
                  </button>
                  <button
                    className="admin-primary-btn vendor-admin-primary"
                    disabled={actionLoading}
                    onClick={() => void handleAccept(detailItem)}
                  >
                    <ShieldCheck size={14} />
                    Chấp nhận
                  </button>
                </>
              )}

              {detailItem.status === 'SHIPPING' && (
                <button
                  className="admin-primary-btn vendor-admin-primary"
                  disabled={actionLoading}
                  onClick={() => void handleMarkReceived(detailItem)}
                >
                  <PackageCheck size={14} />
                  Đã nhận hàng hoàn
                </button>
              )}

              {detailItem.status === 'RECEIVED' && (
                <button
                  className="admin-primary-btn vendor-admin-primary"
                  disabled={actionLoading}
                  onClick={() => void handleConfirmRefund(detailItem)}
                >
                  <CheckCircle2 size={14} />
                  Confirm & Refund
                </button>
              )}
            </PanelDrawerFooter>
          </>
        ) : null}
      </Drawer>
    </VendorLayout>
  );
};

export default VendorReturnDashboard;
