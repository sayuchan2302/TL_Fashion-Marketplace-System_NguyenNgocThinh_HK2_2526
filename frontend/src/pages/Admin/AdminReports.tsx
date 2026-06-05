import './Admin.css';
import { Eye, Ban, CheckCircle2 } from 'lucide-react';
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
import { adminReportService, type AdminReportResponse, type ReportStatus } from './adminReportService';
import AdminReasonDialog from './AdminReasonDialog';
import Drawer from '../../components/Drawer/Drawer';
import AdminProductGovernanceTabs from './AdminProductGovernanceTabs';

const PRODUCT_PLACEHOLDER_IMAGE = '/images/placeholder-product.svg';

const resolveProductThumbnail = (value?: string | null) => {
    const normalized = value?.trim();
    return normalized || PRODUCT_PLACEHOLDER_IMAGE;
};

const parseReason = (reasonKey: string) => {
    const map: Record<string, string> = {
        FAKE_PRODUCT: 'Hàng giả/Nhái',
        WRONG_INFO: 'Sai thông tin',
        INAPPROPRIATE: 'Không phù hợp',
        PROHIBITED: 'Hàng cấm',
        OTHER: 'Khác',
    };
    return map[reasonKey] || reasonKey;
};

const ReportStatusBadge = ({ status }: { status: ReportStatus }) => {
    const config: Record<ReportStatus, { label: string; pillClass: string }> = {
        PENDING: { label: 'Chờ xử lý', pillClass: 'admin-pill pending' },
        CONFIRMED: { label: 'Đã cấm', pillClass: 'admin-pill danger' },
        DISMISSED: { label: 'Bác bỏ', pillClass: 'admin-pill neutral' },
    };
    const { label, pillClass } = config[status] || { label: status, pillClass: 'admin-pill neutral' };
    return <span className={pillClass}>{label}</span>;
};

const productStatusLabel = (status?: string | null) => {
    const map: Record<string, string> = {
        ACTIVE: 'Đang bán',
        INACTIVE: 'Tạm ẩn',
        DRAFT: 'Bản nháp',
        ARCHIVED: 'Lưu trữ',
    };
    return status ? map[status] || status : 'Chưa có';
};

const productApprovalLabel = (status?: string | null) => {
    const map: Record<string, string> = {
        PENDING: 'Chờ duyệt',
        APPROVED: 'Đã duyệt',
        REJECTED: 'Từ chối',
        BANNED: 'Đã cấm',
        UNDER_REVIEW: 'Đang xem xét',
    };
    return status ? map[status] || status : 'Chưa có';
};

const storeStatusLabel = (status?: string | null) => {
    const map: Record<string, string> = {
        ACTIVE: 'Đang hoạt động',
        INACTIVE: 'Tạm ngưng',
        SUSPENDED: 'Bị đình chỉ',
    };
    return status ? map[status] || status : 'Chưa có';
};

const storeApprovalLabel = (status?: string | null) => {
    const map: Record<string, string> = {
        PENDING: 'Chờ duyệt',
        APPROVED: 'Đã duyệt',
        REJECTED: 'Từ chối',
    };
    return status ? map[status] || status : 'Chưa có';
};

const approvalPillClass = (status?: string | null) => {
    if (status === 'APPROVED' || status === 'ACTIVE') return 'admin-pill success';
    if (status === 'BANNED' || status === 'REJECTED' || status === 'SUSPENDED') return 'admin-pill danger';
    if (status === 'PENDING' || status === 'UNDER_REVIEW') return 'admin-pill pending';
    return 'admin-pill neutral';
};

const displayValue = (value?: string | number | null) => {
    if (value === null || value === undefined) return 'Chưa có';
    const normalized = String(value).trim();
    return normalized || 'Chưa có';
};

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

const getReporterName = (report: AdminReportResponse) => report.reporterName?.trim() || report.reporterEmail || 'Khách hàng';

const getReporterInitial = (report: AdminReportResponse) => getReporterName(report).charAt(0).toUpperCase() || '?';

const getSellerName = (report: AdminReportResponse) => report.sellerName?.trim() || report.sellerEmail || 'Seller chưa xác định';

const hasDistinctReporterEmail = (report: AdminReportResponse) => {
    const reporterName = getReporterName(report).trim().toLowerCase();
    const reporterEmail = report.reporterEmail.trim().toLowerCase();
    return Boolean(reporterEmail && reporterEmail !== reporterName);
};

const getReportDescription = (description?: string | null) => description?.trim() || '';

interface AdminReportsProps {
    withinProductGovernance?: boolean;
}

const AdminReports = ({ withinProductGovernance = false }: AdminReportsProps) => {
    const { pushToast } = useAdminToast();
    const [allReports, setAllReports] = useState<AdminReportResponse[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [drawerReport, setDrawerReport] = useState<AdminReportResponse | null>(null);

    const [processTarget, setProcessTarget] = useState<{ id: string; name: string; action: 'BAN' | 'DISMISS' } | null>(null);

    const fetchReports = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await adminReportService.listReports('ALL', 0, 1000);
            setAllReports(res.content || []);
        } catch {
            pushToast('Không tải được danh sách tố cáo.');
        } finally {
            setIsLoading(false);
        }
    }, [pushToast]);

    useEffect(() => {
        void fetchReports();
    }, [fetchReports]);

    const view = useAdminViewState({
        storageKey: 'reports_admin_view', // Instead of modifying ADMIN_VIEW_KEYS object we just inline a key here
        path: withinProductGovernance ? '/admin/product-governance/reports' : '/admin/reports',
        validStatusKeys: ['all', 'pending', 'confirmed', 'dismissed'],
        defaultStatus: 'pending',
    });

    const filteredByStatus = useMemo(() => {
        if (view.status === 'all') return allReports;
        return allReports.filter((item) => item.status.toLowerCase() === view.status);
    }, [allReports, view.status]);

    const {
        search,
        filteredItems,
        pagedItems,
        page,
        setPage,
        totalPages,
        startIndex,
        endIndex,
    } = useAdminListState<AdminReportResponse>({
        items: filteredByStatus,
        pageSize: 15,
        searchValue: view.search,
        onSearchChange: view.setSearch,
        pageValue: view.page,
        onPageChange: view.setPage,
        getSearchText: (row) =>
            `${row.productName} ${row.productSku || ''} ${row.storeName} ${row.storeSlug || ''} ${getSellerName(row)} ${row.sellerEmail || ''} ${getReporterName(row)} ${row.reporterEmail} ${parseReason(row.reason)} ${row.description || ''}`,
        filterPredicate: () => true,
        loadingDeps: [view.status],
    });

    const stats = useMemo(() => {
        const total = allReports.length;
        const pending = allReports.filter((item) => item.status === 'PENDING').length;
        const confirmed = allReports.filter((item) => item.status === 'CONFIRMED').length;
        const dismissed = allReports.filter((item) => item.status === 'DISMISSED').length;
        return { total, pending, confirmed, dismissed };
    }, [allReports]);

    const handleProcess = useCallback(async (reasonText: string) => {
        if (!processTarget) return;
        try {
            await adminReportService.processReport(processTarget.id, processTarget.action, reasonText);
            pushToast(`Đã ${processTarget.action === 'BAN' ? 'cấm' : 'bác bỏ'} thành công.`);
            void fetchReports();
            if (drawerReport?.id === processTarget.id) {
                setDrawerReport(null);
            }
        } catch {
            pushToast('Lỗi khi xử lý tố cáo.');
        } finally {
            setSelected(new Set());
            setProcessTarget(null);
        }
    }, [processTarget, drawerReport, pushToast, fetchReports]);

    const resetCurrentView = () => {
        view.resetCurrentView();
        setSelected(new Set());
        setDrawerReport(null);
    };

    const changeStatus = (key: string) => {
        setSelected(new Set());
        setDrawerReport(null);
        view.setStatus(key);
    };

    const changeSearch = (value: string) => {
        setSelected(new Set());
        setDrawerReport(null);
        view.setSearch(value);
    };

    return (
        <AdminLayout
            title={withinProductGovernance ? 'Kiểm duyệt sản phẩm' : 'Tố cáo sản phẩm'}
            breadcrumbs={
                withinProductGovernance
                    ? ['Gian hàng', 'Kiểm duyệt sản phẩm', 'Tố cáo sản phẩm']
                    : ['Tố cáo sản phẩm', 'Quản lý']
            }
        >
            {withinProductGovernance ? <AdminProductGovernanceTabs activeKey="reports" /> : null}

            <div className="admin-stats grid-4">
                <div className="admin-stat-card">
                    <div className="admin-stat-label">Tổng báo cáo</div>
                    <div className="admin-stat-value">{stats.total}</div>
                    <div className="admin-stat-sub">Tất cả tố cáo</div>
                </div>
                <div className="admin-stat-card warning" onClick={() => changeStatus('pending')} style={{ cursor: 'pointer' }}>
                    <div className="admin-stat-label">Chờ xử lý</div>
                    <div className="admin-stat-value">{stats.pending}</div>
                    <div className="admin-stat-sub">Cần review</div>
                </div>
                <div className="admin-stat-card danger" onClick={() => changeStatus('confirmed')} style={{ cursor: 'pointer' }}>
                    <div className="admin-stat-label">Đã cấm</div>
                    <div className="admin-stat-value">{stats.confirmed}</div>
                    <div className="admin-stat-sub">Sản phẩm bị chặn</div>
                </div>
                <div className="admin-stat-card success" onClick={() => changeStatus('dismissed')} style={{ cursor: 'pointer' }}>
                    <div className="admin-stat-label">Bác bỏ</div>
                    <div className="admin-stat-value">{stats.dismissed}</div>
                    <div className="admin-stat-sub">Báo cáo không hợp lệ</div>
                </div>
            </div>

            <section className="admin-panels single">
                <div className="admin-panel">
                    <div className="admin-panel-head">
                        <h2>Danh sách tố cáo</h2>
                    </div>
                    <div className="admin-filter-toolbar">
                        <PanelSearchField
                            placeholder="Tìm sản phẩm, cửa hàng, tên/email người tố cáo"
                            ariaLabel="Tìm tố cáo"
                            value={search}
                            onChange={changeSearch}
                        />
                        <PanelFilterSelect
                            label="Trạng thái"
                            ariaLabel="Lọc theo trạng thái"
                            items={[
                                { key: 'all', label: 'Tất cả', count: stats.total },
                                { key: 'pending', label: 'Chờ xử lý', count: stats.pending },
                                { key: 'confirmed', label: 'Đã cấm', count: stats.confirmed },
                                { key: 'dismissed', label: 'Bác bỏ', count: stats.dismissed },
                            ]}
                            value={view.status}
                            onChange={changeStatus}
                        />
                        {view.hasViewContext ? (
                            <button type="button" className="admin-filter-reset" onClick={resetCurrentView}>
                                Đặt lại
                            </button>
                        ) : null}
                    </div>

                    {isLoading ? (
                        <AdminStateBlock type="empty" title="Đang tải dữ liệu" description="Đang đồng bộ báo cáo vi phạm..." />
                    ) : filteredItems.length === 0 ? (
                        <AdminStateBlock
                            type={search.trim() ? 'search-empty' : 'empty'}
                            title={search.trim() ? 'Không tìm thấy tố cáo' : 'Chưa có tố cáo nào'}
                            description="Hiện không có báo cáo vi phạm nào cần xử lý."
                            actionLabel="Đặt lại"
                            onAction={resetCurrentView}
                        />
                    ) : (
                        <>
                            <div className="admin-table admin-responsive-table report-table" role="table" aria-label="Bảng tố cáo">
                                <div className="admin-table-row admin-table-head report-row" role="row">
                                    <div role="columnheader">
                                        <input
                                            type="checkbox"
                                            aria-label="Chọn tất cả tố cáo đang lọc"
                                            checked={selected.size === filteredItems.length && filteredItems.length > 0}
                                            onChange={(event) =>
                                                setSelected(event.target.checked ? new Set(filteredItems.map((item) => item.id)) : new Set())
                                            }
                                        />
                                    </div>
                                    <div role="columnheader">Sản phẩm</div>
                                    <div role="columnheader">Người tố cáo</div>
                                    <div role="columnheader">Lý do</div>
                                    <div role="columnheader">Ngày tố cáo</div>
                                    <div role="columnheader">Trạng thái</div>
                                    <div role="columnheader">Hành động</div>
                                </div>

                                {pagedItems.map((report) => (
                                    <motion.div
                                        key={report.id}
                                        className="admin-table-row report-row"
                                        role="row"
                                        whileHover={{ y: -1 }}
                                        onClick={() => setDrawerReport(report)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div role="cell" onClick={(event) => event.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                aria-label={`Chọn tố cáo ${report.productName}`}
                                                checked={selected.has(report.id)}
                                                onChange={(event) => {
                                                    const next = new Set(selected);
                                                    if (event.target.checked) next.add(report.id);
                                                    else next.delete(report.id);
                                                    setSelected(next);
                                                }}
                                            />
                                        </div>
                                        <div role="cell" className="report-product-cell">
                                            <img
                                                src={resolveProductThumbnail(report.productThumbnail)}
                                                alt={report.productName}
                                                className="report-product-thumb"
                                                onError={(event) => {
                                                    event.currentTarget.src = PRODUCT_PLACEHOLDER_IMAGE;
                                                }}
                                            />
                                            <div className="report-product-copy">
                                                <p className="report-product-name">{report.productName}</p>
                                                <p className="report-product-store">{report.storeName || 'Local Shop'}</p>
                                            </div>
                                        </div>
                                        <div role="cell" className="report-reporter-cell">
                                            <span className="report-reporter-avatar" aria-hidden="true">
                                                {getReporterInitial(report)}
                                            </span>
                                            <div className="report-reporter-copy">
                                                <p className="report-reporter-name">{getReporterName(report)}</p>
                                                {hasDistinctReporterEmail(report) ? (
                                                    <p className="report-reporter-email">{report.reporterEmail}</p>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div role="cell" className="report-reason-cell">
                                            <p className="report-reason-title">{parseReason(report.reason)}</p>
                                            {getReportDescription(report.description) ? (
                                                <p className="report-reason-desc">{getReportDescription(report.description)}</p>
                                            ) : null}
                                        </div>
                                        <div role="cell" className="report-date-cell">
                                            {formatDate(report.createdAt)}
                                        </div>
                                        <div role="cell">
                                            <ReportStatusBadge status={report.status} />
                                        </div>
                                        <div role="cell" className="report-actions" onClick={(event) => event.stopPropagation()}>
                                            <button
                                                type="button"
                                                className="admin-icon-btn subtle"
                                                title="Chi tiết"
                                                aria-label={`Xem chi tiết tố cáo ${report.productName}`}
                                                onClick={() => setDrawerReport(report)}
                                            >
                                                <Eye size={16} />
                                            </button>
                                            {report.status === 'PENDING' && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="admin-icon-btn subtle danger-icon"
                                                        title="Chặn sản phẩm"
                                                        aria-label={`Chặn sản phẩm ${report.productName}`}
                                                        onClick={() => setProcessTarget({ id: report.id, name: report.productName, action: 'BAN' })}
                                                    >
                                                        <Ban size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="admin-icon-btn subtle success-icon"
                                                        title="Bác bỏ tố cáo"
                                                        aria-label={`Bác bỏ tố cáo ${report.productName}`}
                                                        onClick={() => setProcessTarget({ id: report.id, name: report.productName, action: 'DISMISS' })}
                                                    >
                                                        <CheckCircle2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            <PanelTableFooter
                                meta={`Hiển thị ${startIndex}-${endIndex} của ${filteredItems.length} báo cáo`}
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
                open={Boolean(drawerReport)}
                onClose={() => setDrawerReport(null)}
                size="lg"
                ariaLabel="Chi tiết báo cáo"
            >
                {drawerReport ? (
                    <>
                        <PanelDrawerHeader
                            eyebrow="Chi tiết báo cáo"
                            title={parseReason(drawerReport.reason)}
                            onClose={() => setDrawerReport(null)}
                            closeLabel="Đóng chi tiết"
                        />
                        <div className="drawer-body report-drawer-body">
                            <PanelDrawerSection title="Tổng quan xử lý">
                                <div className="report-drawer-overview">
                                    <div className="report-drawer-overview-main">
                                        <span className="report-drawer-kicker">Lý do tố cáo</span>
                                        <strong>{parseReason(drawerReport.reason)}</strong>
                                        <span className="admin-muted">
                                            Mã tố cáo: <span className="review-drawer-code">{drawerReport.id}</span>
                                        </span>
                                    </div>
                                    <div className="report-drawer-overview-status">
                                        <ReportStatusBadge status={drawerReport.status} />
                                        <span>{formatDateTime(drawerReport.createdAt)}</span>
                                    </div>
                                </div>
                                <div className="review-drawer-meta-grid report-drawer-metrics">
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Tổng tố cáo sản phẩm</span>
                                        <span className="review-drawer-meta-value"><strong>{drawerReport.productReportCount ?? 0}</strong></span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Đang chờ xử lý</span>
                                        <span className="review-drawer-meta-value"><strong>{drawerReport.productPendingReportCount ?? 0}</strong></span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Kiểm duyệt sản phẩm</span>
                                        <span className={approvalPillClass(drawerReport.productApprovalStatus)}>
                                            {productApprovalLabel(drawerReport.productApprovalStatus)}
                                        </span>
                                    </div>
                                </div>
                            </PanelDrawerSection>

                            <PanelDrawerSection title="Thông tin sản phẩm">
                                <div className="review-drawer-product report-drawer-product-card">
                                    <img
                                        src={resolveProductThumbnail(drawerReport.productThumbnail)}
                                        alt={drawerReport.productName}
                                        className="review-drawer-product-image"
                                        onError={(event) => {
                                            event.currentTarget.src = PRODUCT_PLACEHOLDER_IMAGE;
                                        }}
                                    />
                                    <div className="review-drawer-product-copy">
                                        <p className="review-drawer-product-name">{drawerReport.productName}</p>
                                        <p className="review-drawer-product-sub">SKU: {displayValue(drawerReport.productSku)}</p>
                                        <div className="review-drawer-pill-row">
                                            <span className={approvalPillClass(drawerReport.productStatus)}>
                                                {productStatusLabel(drawerReport.productStatus)}
                                            </span>
                                            <span className={approvalPillClass(drawerReport.productApprovalStatus)}>
                                                {productApprovalLabel(drawerReport.productApprovalStatus)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="review-drawer-meta-grid">
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">ID sản phẩm</span>
                                        <span className="review-drawer-meta-value review-drawer-code">{drawerReport.productId}</span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Tồn kho</span>
                                        <span className="review-drawer-meta-value">{displayValue(drawerReport.productStockQuantity)}</span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Gian hàng</span>
                                        <span className="review-drawer-meta-value review-drawer-stacked">
                                            <strong>{displayValue(drawerReport.storeName)}</strong>
                                            <small>{drawerReport.storeSlug ? `/${drawerReport.storeSlug}` : displayValue(drawerReport.storeId)}</small>
                                        </span>
                                    </div>
                                </div>
                            </PanelDrawerSection>

                            <PanelDrawerSection title="Gian hàng & seller">
                                <div className="report-drawer-seller-card">
                                    {drawerReport.storeLogo ? (
                                        <img src={drawerReport.storeLogo} alt={displayValue(drawerReport.storeName)} className="report-drawer-store-logo" />
                                    ) : (
                                        <span className="report-drawer-store-logo fallback" aria-hidden="true">
                                            {displayValue(drawerReport.storeName).charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                    <div className="report-drawer-seller-copy">
                                        <strong>{displayValue(drawerReport.storeName)}</strong>
                                        <span>{displayValue(drawerReport.storeAddress)}</span>
                                        <div className="review-drawer-pill-row">
                                            <span className={approvalPillClass(drawerReport.storeStatus)}>
                                                {storeStatusLabel(drawerReport.storeStatus)}
                                            </span>
                                            <span className={approvalPillClass(drawerReport.storeApprovalStatus)}>
                                                {storeApprovalLabel(drawerReport.storeApprovalStatus)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="review-drawer-meta-grid">
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Seller</span>
                                        <span className="review-drawer-meta-value review-drawer-stacked">
                                            <strong>{getSellerName(drawerReport)}</strong>
                                            <small>{displayValue(drawerReport.sellerEmail)}</small>
                                        </span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">SĐT seller</span>
                                        <span className="review-drawer-meta-value">{displayValue(drawerReport.sellerPhone)}</span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Email gian hàng</span>
                                        <span className="review-drawer-meta-value">{displayValue(drawerReport.storeContactEmail)}</span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">SĐT gian hàng</span>
                                        <span className="review-drawer-meta-value">{displayValue(drawerReport.storePhone)}</span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Đơn đã xử lý</span>
                                        <span className="review-drawer-meta-value">{displayValue(drawerReport.storeTotalOrders)}</span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Điểm gian hàng</span>
                                        <span className="review-drawer-meta-value">
                                            {typeof drawerReport.storeRating === 'number' ? drawerReport.storeRating.toFixed(1) : 'Chưa có'}
                                        </span>
                                    </div>
                                </div>
                            </PanelDrawerSection>

                            <PanelDrawerSection title="Người tố cáo">
                                <div className="review-drawer-meta-grid">
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Tên khách hàng</span>
                                        <span className="review-drawer-meta-value"><strong>{getReporterName(drawerReport)}</strong></span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Email</span>
                                        <span className="review-drawer-meta-value">{displayValue(drawerReport.reporterEmail)}</span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">ID khách hàng</span>
                                        <span className="review-drawer-meta-value review-drawer-code">{drawerReport.userId}</span>
                                    </div>
                                </div>
                            </PanelDrawerSection>

                            <PanelDrawerSection title="Nội dung tố cáo">
                                <div className="review-drawer-meta-grid">
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Lý do</span>
                                        <span className="review-drawer-meta-value"><strong>{parseReason(drawerReport.reason)}</strong></span>
                                    </div>
                                    <div className="review-drawer-meta-card">
                                        <span className="review-drawer-meta-label">Thời gian gửi</span>
                                        <span className="review-drawer-meta-value">{formatDateTime(drawerReport.createdAt)}</span>
                                    </div>
                                </div>
                                <div className="report-drawer-note">
                                    <p className="admin-bold">Mô tả thêm từ người dùng</p>
                                    <p className="review-drawer-content">
                                        {getReportDescription(drawerReport.description) || 'Không có mô tả chi tiết.'}
                                    </p>
                                </div>
                            </PanelDrawerSection>

                            {drawerReport.adminNote ? (
                                <PanelDrawerSection title="Ghi chú xử lý">
                                    <p className="review-drawer-content report-drawer-note-content">{drawerReport.adminNote}</p>
                                </PanelDrawerSection>
                            ) : null}
                        </div>
                        <PanelDrawerFooter>
                            <button className="admin-ghost-btn" onClick={() => setDrawerReport(null)}>
                                Đóng
                            </button>
                            {drawerReport.status === 'PENDING' && (
                                <div style={{ display: 'flex', marginLeft: 'auto', gap: '8px' }}>
                                    <button
                                        className="admin-ghost-btn"
                                        style={{ color: '#10b981', background: 'transparent' }}
                                        onClick={() => setProcessTarget({ id: drawerReport.id, name: drawerReport.productName, action: 'DISMISS' })}
                                    >
                                        <CheckCircle2 size={16} /> Bác bỏ
                                    </button>
                                    <button
                                        className="admin-ghost-btn danger"
                                        onClick={() => setProcessTarget({ id: drawerReport.id, name: drawerReport.productName, action: 'BAN' })}
                                    >
                                        <Ban size={16} /> Cấm SP
                                    </button>
                                </div>
                            )}
                        </PanelDrawerFooter>
                    </>
                ) : null}
            </Drawer>

            <AdminReasonDialog
                open={Boolean(processTarget)}
                title={processTarget?.action === 'BAN' ? "Quyết định xử phạt" : "Bác bỏ tố cáo"}
                description={processTarget?.action === 'BAN' ? `Bạn đang cấm sản phẩm "${processTarget?.name}". Người bán sẽ nhận được thông báo cấm do các báo cáo vi phạm.` : `Bạn quyết định bác bỏ báo cáo vi phạm đối với sản phẩm này vì thấy nó không hợp lý?`}
                selectedItems={[]}
                confirmLabel={processTarget?.action === 'BAN' ? 'Xác nhận cấm' : 'Xác nhận bác bỏ'}
                danger={processTarget?.action === 'BAN'}
                onCancel={() => setProcessTarget(null)}
                onConfirm={handleProcess}
            />
        </AdminLayout>
    );
};

export default AdminReports;
