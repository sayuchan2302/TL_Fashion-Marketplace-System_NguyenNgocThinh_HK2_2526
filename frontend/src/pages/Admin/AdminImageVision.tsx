import './Admin.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Image,
  RefreshCcw,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react';
import AdminLayout from './AdminLayout';
import {
  adminVisionService,
  type AdminVisionOverview,
  type VisionHealthItem,
  type VisionHealthStatus,
  type VisionSyncState,
} from '../../services/adminVisionService';

const fallbackOverview: AdminVisionOverview = {
  healthItems: [
    {
      id: 'engine',
      label: 'Vision Engine',
      value: 'Đang kiểm tra',
      detail: 'Đang tải trạng thái từ backend',
      status: 'warning',
    },
    {
      id: 'database',
      label: 'Vector DB',
      value: 'Đang kiểm tra',
      detail: 'Đang tải readiness từ vision-engine',
      status: 'warning',
    },
    {
      id: 'backend',
      label: 'Backend Vision',
      value: 'Đang kiểm tra',
      detail: 'Đang kiểm tra cấu hình APP_VISION_*',
      status: 'warning',
    },
    {
      id: 'catalog',
      label: 'Catalog Guard',
      value: 'Đang kiểm tra',
      detail: 'Đang tải kết quả sync gần nhất',
      status: 'warning',
    },
  ],
  indexSummary: {
    modelName: 'unknown',
    modelPretrained: 'unknown',
    embeddingDimension: 0,
    activeImageCount: 0,
    activeProductCount: 0,
    indexVersion: 'empty',
    lastUpdatedAt: null,
  },
  searchMetrics: {
    totalRequests: 0,
    acceptedRequests: 0,
    emptyRequests: 0,
    lowConfidenceRequests: 0,
    invalidImageRequests: 0,
    searchLatencyP95Ms: 0,
    averageTopScore: 0,
    lastSearchAt: null,
  },
  syncSummary: {
    status: 'idle',
    lastSyncedAt: null,
    imagesProcessed: 0,
    embeddingsInserted: 0,
    embeddingsUpdated: 0,
    skippedUnchanged: 0,
    failedImages: 0,
    deactivatedRows: 0,
    message: 'Chưa tải dữ liệu',
  },
  failures: [],
};

const statusMeta: Record<VisionHealthStatus, { label: string; icon: LucideIcon }> = {
  ready: { label: 'Sẵn sàng', icon: CheckCircle2 },
  warning: { label: 'Cảnh báo', icon: AlertTriangle },
  down: { label: 'Không hoạt động', icon: AlertTriangle },
};

const healthItemLabels: Record<string, string> = {
  engine: 'Công cụ xử lý hình ảnh',
  database: 'Cơ sở dữ liệu vector',
  backend: 'Cấu hình backend',
  catalog: 'Trạng thái danh mục',
};

const healthValueLabels: Record<string, string> = {
  Ready: 'Sẵn sàng',
  'Not ready': 'Chưa sẵn sàng',
  Down: 'Không hoạt động',
  Unknown: 'Không xác định',
  Connected: 'Đã kết nối',
  Disabled: 'Đã tắt',
  'Missing base URL': 'Thiếu URL cơ sở',
  'Missing secret': 'Thiếu mã bí mật',
  Enabled: 'Đã bật',
  Syncing: 'Đang đồng bộ',
  'Sync error': 'Lỗi đồng bộ',
  Clean: 'Bình thường',
};

const failureStatusLabels: Record<string, string> = {
  blocked: 'Đã chặn',
  warning: 'Cảnh báo',
  error: 'Lỗi',
};

const failureReasonLabels: Record<string, string> = {
  disallowed_image_url: 'URL hình ảnh không được phép',
  download_too_large: 'Ảnh tải xuống quá lớn',
  decoded_pixels_too_large: 'Ảnh có quá nhiều điểm ảnh',
  decompression_bomb: 'Ảnh bị từ chối vì nguy cơ giải nén quá mức',
  decode_error: 'Không thể đọc ảnh',
  http_error: 'Lỗi HTTP khi tải ảnh',
  download_error: 'Lỗi tải ảnh',
  unknown_error: 'Lỗi không xác định',
};

const healthIconById: Record<string, LucideIcon> = {
  engine: ScanSearch,
  database: Database,
  backend: Activity,
  catalog: AlertTriangle,
};

const syncLabel: Record<VisionSyncState, string> = {
  idle: 'Chưa chạy',
  syncing: 'Đang đồng bộ',
  success: 'Hoàn tất',
  error: 'Có lỗi',
};

const formatNumber = (value: number) => value.toLocaleString('vi-VN');

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'Chưa rõ';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const normalizeSyncMessage = (message?: string | null) => {
  if (!message) {
    return message;
  }

  return {
    'Dong bo catalog hoan tat': 'Đồng bộ catalog hoàn tất',
    'Dang dong bo catalog': 'Đang đồng bộ catalog',
    'Chua chay sync catalog': 'Chưa chạy đồng bộ catalog',
  }[message.trim()] || message;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Không thể tải dữ liệu Image Vision.';

const AdminImageVision = () => {
  const [overview, setOverview] = useState<AdminVisionOverview | null>(null);
  const [syncState, setSyncState] = useState<VisionSyncState>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const applyOverview = useCallback((nextOverview: AdminVisionOverview) => {
    setOverview(nextOverview);
    setSyncState(nextOverview.syncSummary.status);
  }, []);

  const loadOverview = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    setErrorMessage(null);
    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const nextOverview = await adminVisionService.getOverview();
      applyOverview(nextOverview);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [applyOverview]);

  useEffect(() => {
    void loadOverview('initial');
  }, [loadOverview]);

  useEffect(() => {
    if (syncState !== 'syncing') {
      return undefined;
    }

    let cancelled = false;
    const pollOverview = async () => {
      try {
        const nextOverview = await adminVisionService.getOverview();
        if (!cancelled) {
          applyOverview(nextOverview);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error));
        }
      }
    };

    const timer = window.setInterval(() => {
      void pollOverview();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyOverview, syncState]);

  const data = overview ?? fallbackOverview;
  const syncSummary = syncState === 'syncing'
    ? { ...data.syncSummary, status: 'syncing' as const, message: 'Đang đồng bộ catalog' }
    : data.syncSummary;

  const healthCounts = useMemo(() => ({
    ready: data.healthItems.filter((item) => item.status === 'ready').length,
    warning: data.healthItems.filter((item) => item.status === 'warning').length,
    down: data.healthItems.filter((item) => item.status === 'down').length,
  }), [data.healthItems]);

  const handleSyncCatalog = async () => {
    if (syncState === 'syncing') {
      return;
    }

    setErrorMessage(null);
    setSyncState('syncing');
    setOverview((current) => current
      ? {
        ...current,
        syncSummary: {
          ...current.syncSummary,
          status: 'syncing',
          message: 'Đang đồng bộ catalog',
        },
      }
      : current);

    try {
      const nextOverview = await adminVisionService.syncCatalog();
      applyOverview(nextOverview);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setSyncState('error');
      try {
        const nextOverview = await adminVisionService.getOverview();
        applyOverview(nextOverview);
      } catch {
        setSyncState('error');
      }
    }
  };

  const renderStatusCard = (item: VisionHealthItem) => {
    const Icon = healthIconById[item.id] ?? Activity;
    const StatusIcon = statusMeta[item.status]?.icon ?? AlertTriangle;

    return (
      <article className={`image-vision-status-card ${item.status}`} key={item.id}>
        <div className="image-vision-status-icon">
          <Icon size={20} aria-hidden="true" />
        </div>
        <div className="image-vision-status-copy">
          <div className="image-vision-status-topline">
            <span>{healthItemLabels[item.id] ?? item.label}</span>
            <span className={`image-vision-pill ${item.status}`}>
              <StatusIcon size={13} aria-hidden="true" />
              {statusMeta[item.status]?.label ?? item.status}
            </span>
          </div>
          <strong>{healthValueLabels[item.value] ?? item.value}</strong>
          <p>{item.detail}</p>
        </div>
      </article>
    );
  };

  const metricCards = [
    { label: 'Tổng lượt tìm kiếm', value: formatNumber(data.searchMetrics.totalRequests), detail: 'Tổng số yêu cầu tìm kiếm bằng hình ảnh' },
    { label: 'Đã chấp nhận', value: formatNumber(data.searchMetrics.acceptedRequests), detail: 'Yêu cầu có kết quả đủ tin cậy' },
    { label: 'Không có kết quả', value: formatNumber(data.searchMetrics.emptyRequests), detail: 'Không tìm được sản phẩm phù hợp' },
    { label: 'Độ tin cậy thấp', value: formatNumber(data.searchMetrics.lowConfidenceRequests), detail: 'Bị lọc vì điểm tương đồng thấp' },
    { label: 'Ảnh không hợp lệ', value: formatNumber(data.searchMetrics.invalidImageRequests), detail: 'Sai định dạng hoặc dữ liệu ảnh lỗi' },
    { label: 'Độ trễ P95', value: `${Math.round(data.searchMetrics.searchLatencyP95Ms)} ms`, detail: 'Độ trễ tìm kiếm quan sát được' },
  ];

  const indexDetails = [
    ['Mô hình', data.indexSummary.modelName],
    ['Mô hình tiền huấn luyện', data.indexSummary.modelPretrained],
    ['Kích thước vector', String(data.indexSummary.embeddingDimension)],
    ['Phiên bản chỉ mục', data.indexSummary.indexVersion],
    ['Cập nhật lần cuối', formatDateTime(data.indexSummary.lastUpdatedAt)],
    ['Điểm cao nhất trung bình', data.searchMetrics.averageTopScore.toFixed(2)],
  ];

  const syncCards = [
    ['Ảnh đã xử lý', syncSummary.imagesProcessed],
    ['Đã thêm', syncSummary.embeddingsInserted],
    ['Đã cập nhật', syncSummary.embeddingsUpdated],
    ['Đã bỏ qua', syncSummary.skippedUnchanged],
    ['Thất bại', syncSummary.failedImages],
    ['Đã vô hiệu hóa', syncSummary.deactivatedRows],
  ];

  return (
    <AdminLayout
      title="Tìm kiếm bằng hình ảnh"
      breadcrumbs={['Bot và AI', 'Tìm kiếm bằng hình ảnh']}
      actions={(
        <button
          type="button"
          className="admin-primary-btn dark"
          onClick={() => void loadOverview('refresh')}
          disabled={isLoading || isRefreshing || syncState === 'syncing'}
        >
          <RefreshCcw size={16} aria-hidden="true" />
          {isRefreshing ? 'Đang tải...' : 'Tải lại'}
        </button>
      )}
      hideHeaderSearch
    >
      <div className="admin-panels single image-vision-page">
        <section className="admin-panel">
          <div className="admin-panel-head image-vision-head">
            <div>
              <h2>
                <ScanSearch size={20} aria-hidden="true" />
                Quản lý tìm kiếm bằng hình ảnh
              </h2>
              <p className="admin-muted">
                Theo dõi trạng thái hệ thống, chỉ mục, đồng bộ danh mục và số liệu của tính năng tìm kiếm sản phẩm bằng hình ảnh.
              </p>
              {errorMessage ? <p className="image-vision-error">{errorMessage}</p> : null}
            </div>
            <div className="image-vision-health-strip" aria-label="Tổng quan trạng thái tìm kiếm bằng hình ảnh">
              <span className="ready">{healthCounts.ready} sẵn sàng</span>
              <span className="warning">{healthCounts.warning} cảnh báo</span>
              <span className="down">{healthCounts.down} không hoạt động</span>
            </div>
          </div>

          <div className="image-vision-status-grid">
            {data.healthItems.map(renderStatusCard)}
          </div>

          <div className="image-vision-split">
            <section className="image-vision-block image-vision-sync-block">
              <div className="image-vision-block-head">
                <div>
                  <h3>
                    <RefreshCcw size={17} aria-hidden="true" />
                    Đồng bộ danh mục sản phẩm
                  </h3>
                  <p className="admin-muted small">
                    Đồng bộ ảnh sản phẩm sang chỉ mục vector qua vision-engine.
                  </p>
                </div>
                <span className={`image-vision-pill ${syncSummary.status}`}>
                  <Clock size={13} aria-hidden="true" />
                  {syncLabel[syncSummary.status]}
                </span>
              </div>

              <div className={`image-vision-sync-banner ${syncSummary.status}`}>
                <div>
                  <span>Lần sync gần nhất</span>
                  <strong>{formatDateTime(syncSummary.lastSyncedAt)}</strong>
                  {syncSummary.message ? <p className="admin-muted small">{normalizeSyncMessage(syncSummary.message)}</p> : null}
                </div>
                <button
                  type="button"
                  className="admin-primary-btn"
                  onClick={() => void handleSyncCatalog()}
                  disabled={syncState === 'syncing' || isLoading}
                >
                  <RefreshCcw size={16} aria-hidden="true" />
                  {syncState === 'syncing' ? 'Đang đồng bộ...' : 'Đồng bộ catalog'}
                </button>
              </div>

              <div className="image-vision-sync-progress" aria-hidden="true">
                <span style={{ width: syncState === 'syncing' ? '68%' : '100%' }} />
              </div>

              <div className="image-vision-summary-grid">
                {syncCards.map(([label, value]) => (
                  <div className="image-vision-summary-item" key={label}>
                    <span>{label}</span>
                    <strong>{formatNumber(Number(value))}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="image-vision-block">
              <div className="image-vision-block-head">
                <div>
                  <h3>
                    <Image size={17} aria-hidden="true" />
                    Tóm tắt chỉ mục
                  </h3>
                  <p className="admin-muted small">
                    Số liệu chỉ mục lấy từ thông tin của vision-engine.
                  </p>
                </div>
              </div>

              <div className="image-vision-index-hero">
                <div>
                  <span>Indexed images</span>
                  <strong>{formatNumber(data.indexSummary.activeImageCount)}</strong>
                </div>
                <div>
                  <span>Indexed products</span>
                  <strong>{formatNumber(data.indexSummary.activeProductCount)}</strong>
                </div>
              </div>

              <div className="image-vision-detail-list">
                {indexDetails.map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="image-vision-block">
            <div className="image-vision-block-head">
              <div>
                <h3>
                  <Activity size={17} aria-hidden="true" />
                  Số liệu tìm kiếm
                </h3>
                <p className="admin-muted small">
                  Các chỉ số giúp admin biết tính năng tìm kiếm bằng hình ảnh có ổn định và trả kết quả tốt không.
                </p>
              </div>
              <span className="image-vision-last-search">
                Lần tìm kiếm gần nhất: {formatDateTime(data.searchMetrics.lastSearchAt)}
              </span>
            </div>

            <div className="image-vision-metrics-grid">
              {metricCards.map((metric) => (
                <article className="image-vision-metric-card" key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <p>{metric.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="image-vision-block">
            <div className="image-vision-block-head">
              <div>
                <h3>
                  <AlertTriangle size={17} aria-hidden="true" />
                  Lỗi đồng bộ
                </h3>
                <p className="admin-muted small">
                  Danh sách lỗi gần nhất để admin biết ảnh nào cần kiểm tra lại.
                </p>
              </div>
            </div>

            <div className="image-vision-table-scroll">
              <div className="admin-table-row image-vision-failure-row admin-table-head" role="row">
                <div role="columnheader">Sản phẩm</div>
                <div role="columnheader">Trạng thái</div>
                <div role="columnheader">Lý do</div>
                <div role="columnheader">URL hình ảnh</div>
                <div role="columnheader">Ghi chú</div>
              </div>
              {data.failures.length === 0 ? (
                <div className="image-vision-empty-row">Chưa có lỗi đồng bộ gần đây.</div>
              ) : data.failures.map((failure) => (
                <div className="admin-table-row image-vision-failure-row" role="row" key={`${failure.productId}-${failure.reason}-${failure.imageUrl}`}>
                  <div role="cell" className="admin-bold">
                    {failure.productId ? (
                      <Link to={`/admin/products?search=${failure.productId}`} className="admin-bold admin-link">
                        {failure.productId}
                      </Link>
                    ) : (
                      'Không xác định'
                    )}
                  </div>
                  <div role="cell">
                    <span className={`image-vision-pill ${failure.status}`}>{failureStatusLabels[failure.status] ?? failure.status}</span>
                  </div>
                  <div role="cell">{failureReasonLabels[failure.reason] ?? failure.reason}</div>
                  <div role="cell" className="image-vision-url-cell">{failure.imageUrl}</div>
                  <div role="cell">{failure.note}</div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </AdminLayout>
  );
};

export default AdminImageVision;
