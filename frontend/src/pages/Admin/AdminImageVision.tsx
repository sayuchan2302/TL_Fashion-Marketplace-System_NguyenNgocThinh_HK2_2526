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
  ready: { label: 'Ready', icon: CheckCircle2 },
  warning: { label: 'Warning', icon: AlertTriangle },
  down: { label: 'Down', icon: AlertTriangle },
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
            <span>{item.label}</span>
            <span className={`image-vision-pill ${item.status}`}>
              <StatusIcon size={13} aria-hidden="true" />
              {statusMeta[item.status]?.label ?? item.status}
            </span>
          </div>
          <strong>{item.value}</strong>
          <p>{item.detail}</p>
        </div>
      </article>
    );
  };

  const metricCards = [
    { label: 'Total searches', value: formatNumber(data.searchMetrics.totalRequests), detail: 'Tổng request image search' },
    { label: 'Accepted', value: formatNumber(data.searchMetrics.acceptedRequests), detail: 'Request có kết quả đủ tin cậy' },
    { label: 'Empty', value: formatNumber(data.searchMetrics.emptyRequests), detail: 'Không tìm được candidate phù hợp' },
    { label: 'Low confidence', value: formatNumber(data.searchMetrics.lowConfidenceRequests), detail: 'Bị lọc vì điểm thấp' },
    { label: 'Invalid image', value: formatNumber(data.searchMetrics.invalidImageRequests), detail: 'Sai định dạng hoặc payload lỗi' },
    { label: 'P95 latency', value: `${Math.round(data.searchMetrics.searchLatencyP95Ms)} ms`, detail: 'Độ trễ search quan sát được' },
  ];

  const indexDetails = [
    ['Model', data.indexSummary.modelName],
    ['Pretrained', data.indexSummary.modelPretrained],
    ['Embedding dimension', String(data.indexSummary.embeddingDimension)],
    ['Index version', data.indexSummary.indexVersion],
    ['Last updated', formatDateTime(data.indexSummary.lastUpdatedAt)],
    ['Average top score', data.searchMetrics.averageTopScore.toFixed(2)],
  ];

  const syncCards = [
    ['Images processed', syncSummary.imagesProcessed],
    ['Inserted', syncSummary.embeddingsInserted],
    ['Updated', syncSummary.embeddingsUpdated],
    ['Skipped', syncSummary.skippedUnchanged],
    ['Failed', syncSummary.failedImages],
    ['Deactivated', syncSummary.deactivatedRows],
  ];

  return (
    <AdminLayout
      title="Image Vision"
      breadcrumbs={['Bot và AI', 'Image Vision']}
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
                Quản lý Image Vision
              </h2>
              <p className="admin-muted">
                Theo dõi health, index, sync catalog và metrics của tính năng tìm kiếm sản phẩm bằng hình ảnh.
              </p>
              {errorMessage ? <p className="image-vision-error">{errorMessage}</p> : null}
            </div>
            <div className="image-vision-health-strip" aria-label="Tổng quan trạng thái Image Vision">
              <span className="ready">{healthCounts.ready} ready</span>
              <span className="warning">{healthCounts.warning} warning</span>
              <span className="down">{healthCounts.down} down</span>
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
                    Sync catalog
                  </h3>
                  <p className="admin-muted small">
                    Đồng bộ ảnh sản phẩm sang vector index qua vision-engine.
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
                  {syncSummary.message ? <p className="admin-muted small">{syncSummary.message}</p> : null}
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
                    Index summary
                  </h3>
                  <p className="admin-muted small">
                    Số liệu index lấy từ vision-engine index info.
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
                  Search metrics
                </h3>
                <p className="admin-muted small">
                  Các chỉ số giúp admin biết image search có ổn định và có trả kết quả tốt không.
                </p>
              </div>
              <span className="image-vision-last-search">
                Last search: {formatDateTime(data.searchMetrics.lastSearchAt)}
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
                  Sync failures
                </h3>
                <p className="admin-muted small">
                  Danh sách lỗi gần nhất để admin biết ảnh nào cần kiểm tra lại.
                </p>
              </div>
            </div>

            <div className="image-vision-table-scroll">
              <div className="admin-table-row image-vision-failure-row admin-table-head" role="row">
                <div role="columnheader">Product</div>
                <div role="columnheader">Status</div>
                <div role="columnheader">Reason</div>
                <div role="columnheader">Image URL</div>
                <div role="columnheader">Note</div>
              </div>
              {data.failures.length === 0 ? (
                <div className="image-vision-empty-row">Chưa có lỗi sync gần đây.</div>
              ) : data.failures.map((failure) => (
                <div className="admin-table-row image-vision-failure-row" role="row" key={`${failure.productId}-${failure.reason}-${failure.imageUrl}`}>
                  <div role="cell" className="admin-bold">
                    {failure.productId ? (
                      <Link to={`/admin/products?search=${failure.productId}`} className="admin-bold admin-link">
                        {failure.productId}
                      </Link>
                    ) : (
                      'unknown'
                    )}
                  </div>
                  <div role="cell">
                    <span className={`image-vision-pill ${failure.status}`}>{failure.status}</span>
                  </div>
                  <div role="cell">{failure.reason}</div>
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
