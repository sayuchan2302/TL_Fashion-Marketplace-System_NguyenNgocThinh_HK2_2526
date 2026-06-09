import './Vendor.css';
import '../OrderDetail/OrderDetail.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Eye, AlertTriangle, Camera, Loader2, X } from 'lucide-react';
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
import { returnService, type ReturnAdditionalEvidenceRequest, type ReturnRequest, type ReturnStatus } from '../../services/returnService';
import { useToast } from '../../contexts/ToastContext';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { toDisplayOrderCode, toDisplayReturnCode } from '../../utils/displayCode';
import { normalizePositiveInteger } from './vendorHelpers';

type VendorReturnTab = 'all' | 'needsAction' | 'inTransit' | 'toInspect' | 'disputed' | 'completed';

const PAGE_SIZE = 10;

const TABS: Array<{ key: VendorReturnTab; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'needsAction', label: 'Cần xử lý (48h)' },
  { key: 'inTransit', label: 'Đang vận chuyển' },
  { key: 'toInspect', label: 'Đã nhận hàng' },
  { key: 'disputed', label: 'Tranh chấp' },
  { key: 'completed', label: 'Đã xử lý' },
];

const normalizeTab = (value: string | null): VendorReturnTab => {
  if (value === 'needsAction' || value === 'inTransit' || value === 'toInspect' || value === 'disputed' || value === 'completed') {
    return value;
  }

  return 'all';
};

const statusConfig: Record<ReturnRequest['status'], { label: string; className: string }> = {
  REQUESTED: { label: 'Chờ lấy hàng', className: 'admin-pill neutral' },
  IN_TRANSIT: { label: 'Đang vận chuyển', className: 'admin-pill neutral' },
  DELIVERED_TO_SELLER: { label: 'Cần xử lý (48h)', className: 'admin-pill pending' },
  REFUND_SUCCESS: { label: 'Đã hoàn tiền', className: 'admin-pill success' },
  DISPUTING: { label: 'Tranh chấp', className: 'admin-pill error' },
  RETURN_REJECTED: { label: 'Từ chối', className: 'admin-pill error' },
  CANCELLED: { label: 'Đã hủy', className: 'admin-pill neutral' },
};

const reasonLabel: Record<string, string> = {
  SIZE: 'Sai kích cỡ',
  DEFECT: 'Lỗi sản phẩm',
  CHANGE: 'Hàng giả',
  OTHER: 'Lý do khác',
};

const TAB_STATUS_MAP: Record<VendorReturnTab, ReturnStatus[] | undefined> = {
  all: undefined,
  // Only DELIVERED_TO_SELLER requires action (48h deadline)
  needsAction: ['DELIVERED_TO_SELLER'],
  // Items being shipped back to vendor
  inTransit: ['REQUESTED', 'IN_TRANSIT'],
  // Items received by vendor, waiting for decision
  toInspect: ['DELIVERED_TO_SELLER'],
  // Disputes requiring admin resolution
  disputed: ['DISPUTING'],
  // Completed returns (approved or rejected)
  completed: ['REFUND_SUCCESS', 'RETURN_REJECTED', 'CANCELLED'],
};

type VendorTabCounts = Record<VendorReturnTab, number>;

const EMPTY_COUNTS: VendorTabCounts = {
  all: 0,
  needsAction: 0,
  inTransit: 0,
  toInspect: 0,
  disputed: 0,
  completed: 0,
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

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const resolveEvidenceUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:image/')) {
    return url;
  }
  return API_BASE ? `${API_BASE}${url.startsWith('/') ? url : `/${url}`}` : url;
};

const evidenceActorLabel: Record<string, string> = {
  CUSTOMER: 'Customer',
  VENDOR: 'Vendor',
};

const findPendingVendorEvidenceRequest = (
  requests?: ReturnAdditionalEvidenceRequest[],
): ReturnAdditionalEvidenceRequest | undefined =>
  requests?.find((request) => !(request.evidence || []).some((evidence) => evidence.submittedByRole === 'VENDOR'));

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
  const [disputeEvidence, setDisputeEvidence] = useState('');
  const [additionalEvidenceNote, setAdditionalEvidenceNote] = useState('');
  const [additionalEvidenceUrl, setAdditionalEvidenceUrl] = useState('');
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [isUploadingAdditionalEvidence, setIsUploadingAdditionalEvidence] = useState(false);
  const [activeEnlargedImage, setActiveEnlargedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const additionalEvidenceFileInputRef = useRef<HTMLInputElement>(null);
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
        completed: Number(summary.completed || 0),
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
  const pendingVendorEvidenceRequest = detailItem
    ? findPendingVendorEvidenceRequest(detailItem.additionalEvidenceRequests)
    : undefined;

  const handleApprove = async (request: ReturnRequest) => {
    try {
      setActionLoading(true);
      const updated = await returnService.approveByVendor(request.id);
      setDetailItem((current) => (current?.id === updated.id ? updated : current));
      await Promise.all([fetchPageData(), fetchTabCounts()]);
      addToast(`Đã chấp nhận yêu cầu ${toDisplayReturnCode(updated.code)}.`, 'success');
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể chấp nhận yêu cầu hoàn trả.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEvidenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.toLowerCase().startsWith('image/')) {
      addToast('Chỉ chấp nhận file hình ảnh cho minh chứng tố cáo.', 'error');
      event.target.value = '';
      return;
    }

    setIsUploadingEvidence(true);
    try {
      const evidenceUrl = await returnService.uploadEvidence(file);
      setDisputeEvidence(evidenceUrl);
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Tải ảnh minh chứng thất bại.'), 'error');
    } finally {
      setIsUploadingEvidence(false);
      event.target.value = '';
    }
  };

  const handleRemoveEvidence = () => {
    setDisputeEvidence('');
  };

  const handleAdditionalEvidenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.toLowerCase().startsWith('image/')) {
      addToast('Chỉ chấp nhận file hình ảnh cho bằng chứng bổ sung.', 'error');
      event.target.value = '';
      return;
    }

    setIsUploadingAdditionalEvidence(true);
    try {
      const evidenceUrl = await returnService.uploadEvidence(file);
      setAdditionalEvidenceUrl(evidenceUrl);
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Tải ảnh bằng chứng bổ sung thất bại.'), 'error');
    } finally {
      setIsUploadingAdditionalEvidence(false);
      event.target.value = '';
    }
  };

  const handleSubmitAdditionalEvidence = async (
    request: ReturnRequest,
    evidenceRequest: ReturnAdditionalEvidenceRequest,
  ) => {
    const normalizedNote = additionalEvidenceNote.trim();
    if (!normalizedNote) {
      addToast('Vui lòng nhập ghi chú cho bằng chứng bổ sung.', 'error');
      return;
    }
    if (!additionalEvidenceUrl.trim()) {
      addToast('Vui lòng tải lên ảnh bằng chứng bổ sung.', 'error');
      return;
    }

    try {
      setActionLoading(true);
      const updated = await returnService.submitAdditionalEvidence(
        request.id,
        evidenceRequest.id,
        normalizedNote,
        additionalEvidenceUrl,
      );
      setDetailItem((current) => (current?.id === updated.id ? updated : current));
      await Promise.all([fetchPageData(), fetchTabCounts()]);
      setAdditionalEvidenceNote('');
      setAdditionalEvidenceUrl('');
      addToast(`Đã gửi bằng chứng bổ sung cho yêu cầu ${toDisplayReturnCode(updated.code)}.`, 'success');
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể gửi bằng chứng bổ sung.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispute = async (request: ReturnRequest, reason: string, evidenceUrl: string) => {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      addToast('Vui lòng nhập lý do tố cáo gian lận.', 'error');
      return;
    }
    if (!evidenceUrl.trim()) {
      addToast('Vui lòng tải lên ảnh minh chứng tố cáo.', 'error');
      return;
    }

    try {
      setActionLoading(true);
      const updated = await returnService.disputeByVendor(request.id, normalizedReason, evidenceUrl);
      setDetailItem((current) => (current?.id === updated.id ? updated : current));
      await Promise.all([fetchPageData(), fetchTabCounts()]);
      setRejectReason('');
      setDisputeEvidence('');
      addToast(`Đã gửi tố cáo gian lận cho yêu cầu ${toDisplayReturnCode(updated.code)}.`, 'success');
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể gửi tố cáo gian lận.'), 'error');
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
                  <div role="columnheader">Sản phẩm</div>
                  <div role="columnheader">Khách hàng</div>
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
                  const pendingEvidenceRequest = findPendingVendorEvidenceRequest(item.additionalEvidenceRequests);

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
                      <div role="cell" className="returns-customer-cell">
                        <strong className="returns-ellipsis">{item.customerName || 'Khách hàng'}</strong>
                        <small className="admin-muted returns-ellipsis">{item.customerEmail || 'Chưa có email'}</small>
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
                        {pendingEvidenceRequest ? (
                          <button
                            className="admin-icon-btn subtle vendor-evidence-alert-btn"
                            title="Admin yêu cầu bổ sung bằng chứng"
                            aria-label={`Admin yêu cầu bổ sung bằng chứng cho ${toDisplayReturnCode(item.code)}`}
                            onClick={() => setDetailItem(item)}
                            disabled={actionLoading}
                          >
                            !
                          </button>
                        ) : null}
                        {['REQUESTED', 'IN_TRANSIT', 'DELIVERED_TO_SELLER'].includes(item.status) && (
                          <>
                            <button
                              className="admin-icon-btn subtle success-icon"
                              title="Đã nhận"
                              onClick={() => void handleApprove(item)}
                              disabled={actionLoading}
                            >
                              <CheckCircle2 size={16} />
                            </button>
                            <button
                              className="admin-icon-btn subtle danger-icon"
                              title="Tố cáo"
                              onClick={() => setDetailItem(item)}
                              disabled={actionLoading}
                            >
                              <AlertTriangle size={16} />
                            </button>
                          </>
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
          setDisputeEvidence('');
          setAdditionalEvidenceNote('');
          setAdditionalEvidenceUrl('');
        }}
        className="returns-drawer"
        size="lg"
        ariaLabel="Chi tiết yêu cầu hoàn trả"
      >
        {detailItem ? (
          <>
            <PanelDrawerHeader
              eyebrow="Chi tiết hoàn trả"
              title={toDisplayReturnCode(detailItem.code)}
              onClose={() => {
                setDetailItem(null);
                setRejectReason('');
                setDisputeEvidence('');
                setAdditionalEvidenceNote('');
                setAdditionalEvidenceUrl('');
              }}
              closeLabel="Đóng chi tiết hoàn trả"
            />

            <div className="drawer-body">
              <PanelDrawerSection title="Tổng quan yêu cầu">
                <div className="returns-drawer-hero" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '16px' }}>
                  <div
                    className="returns-customer-avatar large"
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      background: '#f1f5f9',
                      color: '#0f172a',
                      fontFamily: 'inherit',
                      fontSize: '18px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden',
                      border: '1px solid #cbd5e1'
                    }}
                  >
                    {detailItem.customerName ? detailItem.customerName.trim().charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div className="admin-bold" style={{ fontSize: '15px', color: '#0f172a' }}>{detailItem.customerName}</div>
                    <div className="admin-muted" style={{ fontSize: '12px' }}>{detailItem.customerEmail || 'Chưa có email'}</div>
                  </div>
                  <div className="returns-hero-pills" style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <span className={statusConfig[detailItem.status].className}>
                      {statusConfig[detailItem.status].label}
                    </span>
                    <span className="admin-pill neutral">
                      {detailItem.resolution === 'REFUND' ? 'Hoàn tiền' : 'Đổi trả'}
                    </span>
                  </div>
                </div>

                <div className="returns-meta-grid">
                  <article className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Mã đơn hàng</span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>#{toDisplayOrderCode(detailItem.orderCode)}</strong>
                  </article>
                  <article className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Số điện thoại khách</span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{detailItem.customerPhone || 'Chưa có số điện thoại'}</strong>
                  </article>
                  <article className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Giá trị hoàn trả</span>
                    <strong style={{ fontSize: '14px', color: '#0d9488', fontWeight: 800 }}>{formatVnd(getRefundAmount(detailItem))}</strong>
                  </article>
                  <article className="returns-meta-card" style={{ gridColumn: 'span 2', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Thời điểm tạo yêu cầu</span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{detailItem.createdAt ? new Date(detailItem.createdAt).toLocaleString('vi-VN') : 'Chưa cập nhật'}</strong>
                  </article>
                </div>
              </PanelDrawerSection>

              {detailItem.items.length > 0 && (
                <PanelDrawerSection title={`Sản phẩm đổi/trả (${detailItem.items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0)})`}>
                  <div className="returns-items-list">
                    {detailItem.items.map((item) => (
                      <article key={item.orderItemId} className="returns-item-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'stretch', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', marginBottom: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: '16px', alignItems: 'center' }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.productName} className="returns-item-image" style={{ width: '64px', height: '64px', borderRadius: '10px', objectFit: 'cover', border: '1px solid #e2e8f0' }} />
                          ) : (
                            <div className="returns-item-image placeholder" style={{ width: '64px', height: '64px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#94a3b8', fontSize: '11px', fontWeight: 700 }}>SP</div>
                          )}
                          <div className="returns-item-content">
                            <strong className="returns-item-name" style={{ fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>{item.productName}</strong>
                            <small className="admin-muted" style={{ display: 'block', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{item.variantName || 'Biến thể mặc định'}</small>
                            <div className="returns-item-meta" style={{ display: 'flex', gap: '16px', fontSize: '13px', marginTop: '6px' }}>
                              <span style={{ color: '#64748b' }}>Số lượng: <strong>x{item.quantity}</strong></span>
                              <span style={{ color: '#64748b' }}>Đơn giá: <strong>{formatVnd(item.unitPrice)}</strong></span>
                            </div>
                          </div>
                        </div>
                        {item.evidenceUrl ? (
                          <div style={{ marginTop: '6px', borderTop: '1px dashed #e2e8f0', paddingTop: '10px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                              <Camera size={14} /> Ảnh minh chứng của khách hàng (bấm để xem lớn):
                            </span>
                            <div
                              onClick={() => setActiveEnlargedImage(resolveEvidenceUrl(item.evidenceUrl))}
                              style={{
                                width: '120px',
                                height: '120px',
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
                                alt="Evidence Thumbnail"
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


              {['REQUESTED', 'IN_TRANSIT', 'DELIVERED_TO_SELLER'].includes(detailItem.status) && (
                <div style={{
                  padding: '12px 16px',
                  margin: '0 0 16px',
                  background: 'var(--co-yellow-100, #fef3c7)',
                  border: '1px solid var(--co-yellow-300, #fde047)',
                  borderRadius: '12px'
                }}>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--co-yellow-900, #713f12)' }}>
                    <strong>⏰ Cần xử lý trong 48h:</strong> Bạn cần chấp nhận hoàn trả hoặc tố cáo gian lận trong vòng 48 giờ.
                    Nếu không xử lý, hệ thống sẽ tự động chấp nhận và hoàn tiền cho khách.
                  </p>
                </div>
              )}

              <PanelDrawerSection title="Chi tiết lý do">
                <div className="returns-reason-box" style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p className="returns-note-text" style={{ margin: 0 }}><strong>Lý do từ khách hàng:</strong> {reasonLabel[detailItem.reason] || detailItem.reason}</p>
                  <p className="returns-note-text" style={{ margin: 0 }}><strong>Muốn:</strong> {detailItem.resolution === 'REFUND' ? 'Hoàn tiền' : 'Đổi trả'}</p>
                  <p className="returns-note-text" style={{ margin: 0 }}><strong>Ghi chú từ khách:</strong> {detailItem.note?.trim() || 'Không có ghi chú thêm từ khách.'}</p>
                  {detailItem.disputeReason ? (
                    <p className="returns-note-text" style={{ margin: 0 }}><strong>Lý do tranh chấp:</strong> {detailItem.disputeReason}</p>
                  ) : null}
                </div>
              </PanelDrawerSection>

              {detailItem.additionalEvidenceRequests && detailItem.additionalEvidenceRequests.length > 0 ? (
                <PanelDrawerSection title="Bằng chứng bổ sung theo yêu cầu admin">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {detailItem.additionalEvidenceRequests.map((request, requestIndex) => (
                      <article
                        key={request.id || requestIndex}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          background: '#f8fafc',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                          Yêu cầu #{requestIndex + 1}: {request.message}
                        </strong>
                        {request.evidence && request.evidence.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {request.evidence.map((evidence) => (
                              <div key={evidence.id} style={{ display: 'grid', gridTemplateColumns: '74px minmax(0, 1fr)', gap: '10px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
                                <div
                                  onClick={() => setActiveEnlargedImage(resolveEvidenceUrl(evidence.evidenceUrl))}
                                  style={{ width: '74px', height: '74px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                                  className="returns-evidence-thumbnail-hover"
                                >
                                  <img src={resolveEvidenceUrl(evidence.evidenceUrl)} alt="Bằng chứng bổ sung" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <span className={evidence.submittedByRole === 'VENDOR' ? 'admin-pill pending' : 'admin-pill neutral'}>
                                    {evidenceActorLabel[evidence.submittedByRole] || evidence.submittedByRole}
                                  </span>
                                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#475569', whiteSpace: 'pre-wrap' }}>
                                    {evidence.note}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="admin-muted" style={{ margin: 0, fontSize: '12px' }}>
                            Chưa có bên nào phản hồi yêu cầu này.
                          </p>
                        )}
                      </article>
                    ))}

                    {pendingVendorEvidenceRequest ? (
                      <div className="returns-note-input-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: '12px', padding: '14px' }}>
                        <strong style={{ fontSize: '13px', color: '#92400e' }}>
                          Vendor cần bổ sung bằng chứng cho yêu cầu mới nhất
                        </strong>
                        <textarea
                          value={additionalEvidenceNote}
                          onChange={(event) => setAdditionalEvidenceNote(event.target.value)}
                          rows={3}
                          placeholder="Ghi chú bổ sung cho admin..."
                          className="returns-note-input"
                        />
                        <div className="return-evidence-upload">
                          <input
                            ref={additionalEvidenceFileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(event) => void handleAdditionalEvidenceUpload(event)}
                            hidden
                          />
                          {additionalEvidenceUrl ? (
                            <div className={`return-evidence-preview ${isUploadingAdditionalEvidence ? 'uploading' : ''}`}>
                              <img
                                src={resolveEvidenceUrl(additionalEvidenceUrl)}
                                alt="Bằng chứng bổ sung"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setActiveEnlargedImage(resolveEvidenceUrl(additionalEvidenceUrl))}
                              />
                              {isUploadingAdditionalEvidence ? <span className="return-evidence-status">Đang tải</span> : null}
                              <button
                                type="button"
                                className="return-evidence-remove"
                                onClick={() => setAdditionalEvidenceUrl('')}
                                aria-label="Xóa ảnh bổ sung"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="return-evidence-btn"
                            onClick={() => additionalEvidenceFileInputRef.current?.click()}
                            disabled={isUploadingAdditionalEvidence}
                          >
                            {isUploadingAdditionalEvidence ? <Loader2 size={16} className="return-spin" /> : <Camera size={16} />}
                            <span>{isUploadingAdditionalEvidence ? 'Đang tải...' : additionalEvidenceUrl ? 'Đổi ảnh' : 'Thêm ảnh'}</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          className="admin-primary-btn"
                          disabled={actionLoading || isUploadingAdditionalEvidence}
                          onClick={() => void handleSubmitAdditionalEvidence(detailItem, pendingVendorEvidenceRequest)}
                        >
                          Gửi bằng chứng bổ sung
                        </button>
                      </div>
                    ) : null}
                  </div>
                </PanelDrawerSection>
              ) : null}



              {['REQUESTED', 'IN_TRANSIT', 'DELIVERED_TO_SELLER'].includes(detailItem.status) ? (
                <PanelDrawerSection title="Tố cáo gian lận (Bắt buộc khi chọn tố cáo)">
                  <div className="returns-note-input-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <textarea
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      rows={4}
                      placeholder="Lý do tố cáo gian lận... (Ví dụ: Khách tráo hàng, hàng không còn nguyên vẹn)"
                      className="returns-note-input"
                    />

                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginTop: '6px' }}>
                      Ảnh minh chứng từ người bán
                    </span>
                    <div className="return-evidence-upload">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(event) => void handleEvidenceUpload(event)}
                        hidden
                      />
                      {disputeEvidence ? (
                        <div className={`return-evidence-preview ${isUploadingEvidence ? 'uploading' : ''}`}>
                          <img
                            src={resolveEvidenceUrl(disputeEvidence)}
                            alt="Ảnh minh chứng tố cáo"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setActiveEnlargedImage(resolveEvidenceUrl(disputeEvidence))}
                          />
                          {isUploadingEvidence ? <span className="return-evidence-status">Đang tải</span> : null}
                          <button
                            type="button"
                            className="return-evidence-remove"
                            onClick={handleRemoveEvidence}
                            aria-label="Xóa ảnh"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="return-evidence-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingEvidence}
                      >
                        {isUploadingEvidence ? <Loader2 size={16} className="return-spin" /> : <Camera size={16} />}
                        <span>{isUploadingEvidence ? 'Đang tải...' : disputeEvidence ? 'Đổi ảnh' : 'Thêm ảnh'}</span>
                      </button>
                    </div>
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
                  setDisputeEvidence('');
                  setAdditionalEvidenceNote('');
                  setAdditionalEvidenceUrl('');
                }}
              >
                Đóng
              </button>

              {['REQUESTED', 'IN_TRANSIT', 'DELIVERED_TO_SELLER'].includes(detailItem.status) && (
                <>
                  <button
                    className="admin-ghost-btn danger"
                    disabled={actionLoading || isUploadingEvidence}
                    onClick={() => void handleDispute(detailItem, rejectReason, disputeEvidence)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <AlertTriangle size={14} />
                    Tố cáo
                  </button>
                  <button
                    className="admin-primary-btn vendor-admin-primary"
                    disabled={actionLoading || isUploadingEvidence}
                    onClick={() => void handleApprove(detailItem)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <CheckCircle2 size={14} />
                    Đã nhận hàng (Hoàn tiền)
                  </button>
                </>
              )}
            </PanelDrawerFooter>
          </>
        ) : null
        }
      </Drawer >
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
    </VendorLayout >
  );
};

export default VendorReturnDashboard;
