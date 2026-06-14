import './AdminStores.css';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Ban, Check, Eye, RotateCcw, Store, X } from 'lucide-react';
import AdminLayout from './AdminLayout';
import AdminConfirmDialog from './AdminConfirmDialog';
import { AdminStateBlock } from './AdminStateBlocks';
import {
  PanelDrawerFooter,
  PanelDrawerHeader,
  PanelDrawerSection,
  PanelFilterSelect,
  PanelSearchField,
  PanelStatsGrid,
  PanelTabs,
  PanelTableFooter,
} from '../../components/Panel/PanelPrimitives';
import { useToast } from '../../contexts/ToastContext';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { storeService, type StoreProfile } from '../../services/storeService';
import Drawer from '../../components/Drawer/Drawer';
import { ADMIN_VIEW_KEYS } from './adminListView';
import { useAdminViewState } from './useAdminViewState';

interface ManagedStore extends StoreProfile {
  operatingStatus: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  productCount: number;
  liveProductCount: number;
  responseRate: number;
  warehouseAddress: string;
}

type StoreFilter = 'all' | 'pending' | 'active' | 'suspended' | 'rejected';
type StoreScope = 'activeStores' | 'sellerRequests';
type StoreScaleFilter = 'all' | 'hasProducts' | 'live' | 'noLive';
type ConfirmMode = 'approve' | 'suspend' | 'reactivate';
type ConfirmState = { mode: ConfirmMode; ids: string[]; selectedItems: string[] };

const TABS: Array<{ key: StoreFilter; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'active', label: 'Đang hoạt động' },
  { key: 'suspended', label: 'Tạm khóa' },
  { key: 'rejected', label: 'Từ chối' },
];

const STORE_SCOPE_TABS: Array<{ key: StoreScope; label: string }> = [
  { key: 'activeStores', label: 'Gian hàng đang hoạt động' },
  { key: 'sellerRequests', label: 'Yêu cầu trở thành Vendor' },
];

const ACTIVE_STORE_TABS: Array<{ key: StoreFilter; label: string }> = [
  { key: 'active', label: 'Đang hoạt động' },
  { key: 'suspended', label: 'Tạm khóa' },
  { key: 'all', label: 'Tất cả đã duyệt' },
];

const SELLER_REQUEST_TABS: Array<{ key: StoreFilter; label: string }> = [
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'rejected', label: 'Đã từ chối' },
  { key: 'all', label: 'Tất cả yêu cầu' },
];

const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;

const approvalLabel = (status: ManagedStore['approvalStatus']) => {
  if (status === 'APPROVED') return 'Đã duyệt';
  if (status === 'REJECTED') return 'Đã từ chối';
  return 'Chờ duyệt';
};

const approvalTone = (status: ManagedStore['approvalStatus']) => {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'error';
  return 'pending';
};

const operatingLabel = (status: ManagedStore['operatingStatus']) => {
  if (status === 'ACTIVE') return 'Đang hoạt động';
  if (status === 'SUSPENDED') return 'Tạm khóa';
  return 'Chưa kích hoạt';
};

const operatingTone = (status: ManagedStore['operatingStatus']) => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED') return 'error';
  return 'neutral';
};

const mapStore = (store: StoreProfile): ManagedStore => ({
  ...store,
  operatingStatus:
    store.approvalStatus === 'APPROVED'
      ? store.status === 'SUSPENDED'
        ? 'SUSPENDED'
        : 'ACTIVE'
      : 'INACTIVE',
  productCount: Number(store.productCount ?? 0),
  liveProductCount: Number(store.liveProductCount ?? 0),
  responseRate: Number(store.responseRate ?? 0),
  warehouseAddress: store.warehouseAddress || store.address || 'Chưa cấu hình kho lấy hàng',
});

const buildStoreProfileFields = (store: ManagedStore) => [
  {
    key: 'owner',
    label: 'Chủ sở hữu',
    value: store.applicantName || 'Chưa đăng ký chủ sở hữu',
  },
  {
    key: 'email',
    label: 'Email liên hệ',
    value: store.applicantEmail || store.contactEmail || 'Chưa có email',
  },
  {
    key: 'phone',
    label: 'Số điện thoại',
    value: store.phone || 'Chưa cập nhật',
  },
  {
    key: 'warehouse',
    label: 'Kho lấy hàng',
    value: store.warehouseAddress,
    span: 'full' as const,
  },
];

const SCALE_FILTERS: Array<{ key: StoreScaleFilter; label: string }> = [
  { key: 'all', label: 'Tất cả quy mô' },
  { key: 'hasProducts', label: 'Có sản phẩm' },
  { key: 'live', label: 'Đang bán' },
  { key: 'noLive', label: 'Chưa live SKU' },
];

const validScaleFilters = new Set<StoreScaleFilter>(SCALE_FILTERS.map((item) => item.key));

const getStoreScopeFromStatus = (status: string): StoreScope =>
  status === 'pending' || status === 'rejected' ? 'sellerRequests' : 'activeStores';

const buildStoreSignalCards = (store: ManagedStore) => [
  {
    key: 'products',
    label: 'Sản phẩm',
    value: `${store.liveProductCount.toLocaleString('vi-VN')}/${store.productCount.toLocaleString('vi-VN')}`,
    sub: 'đang hiển thị / tổng SKU',
  },
  {
    key: 'orders',
    label: 'Đơn hàng',
    value: store.totalOrders.toLocaleString('vi-VN'),
    sub: 'đơn đã ghi nhận',
  },
  {
    key: 'gmv',
    label: 'GMV',
    value: formatCurrency(store.totalSales),
    sub: 'doanh số toàn gian hàng',
  },
  {
    key: 'rating',
    label: 'Đánh giá',
    value: store.rating.toFixed(1),
    sub: 'trung bình khách hàng',
  },
  {
    key: 'responseRate',
    label: 'Phản hồi',
    value: `${store.responseRate.toLocaleString('vi-VN')}%`,
    sub: 'tỷ lệ phản hồi của shop',
  },
  {
    key: 'createdAt',
    label: 'Ngày tạo',
    value: new Date(store.createdAt).toLocaleDateString('vi-VN'),
    sub: 'mốc khởi tạo hồ sơ',
  },
];


const StoreApprovals = () => {
  const { addToast } = useToast();
  const [stores, setStores] = useState<ManagedStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailStore, setDetailStore] = useState<ManagedStore | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [commissionRateInput, setCommissionRateInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [resettingCommissionRate, setResettingCommissionRate] = useState(false);
  const pageSize = 8;
  const view = useAdminViewState({
    storageKey: ADMIN_VIEW_KEYS.stores,
    path: '/admin/stores',
    validStatusKeys: TABS.map((tab) => tab.key),
    defaultStatus: 'active',
    extraFilters: [
      { key: 'scale', defaultValue: 'all', validate: (value) => validScaleFilters.has(value as StoreScaleFilter) },
    ],
  });
  const [storeScope, setStoreScope] = useState<StoreScope>(() => getStoreScopeFromStatus(view.status));
  const statusTabs = storeScope === 'sellerRequests' ? SELLER_REQUEST_TABS : ACTIVE_STORE_TABS;
  const fallbackStatus: StoreFilter = storeScope === 'sellerRequests' ? 'pending' : 'active';
  const activeTab = (statusTabs.some((tab) => tab.key === view.status) ? view.status : fallbackStatus) as StoreFilter;
  const scaleFilter = (validScaleFilters.has(view.extras.scale as StoreScaleFilter) ? view.extras.scale : 'all') as StoreScaleFilter;
  const search = view.search;
  const page = view.page;
  const isSellerRequestScope = storeScope === 'sellerRequests';

  useEffect(() => {
    let active = true;

    const fetchStores = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const adminStores = await storeService.getAdminStores();
        if (!active) return;
        setStores(adminStores.map(mapStore));
      } catch (error: unknown) {
        if (!active) return;
        setStores([]);
        const message = getUiErrorMessage(error, 'Không tải được danh sách gian hàng từ backend.');
        setLoadError(message);
        addToast(message, 'error');
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchStores();
    return () => {
      active = false;
    };
  }, [addToast, reloadKey]);

  useEffect(() => {
    setCommissionRateInput(
      detailStore?.effectiveCommissionRate != null
        ? String(detailStore.effectiveCommissionRate)
        : detailStore?.commissionRate != null
          ? String(detailStore.commissionRate)
          : '',
    );
  }, [detailStore?.id, detailStore?.commissionRate, detailStore?.effectiveCommissionRate]);

  const filteredStores = useMemo(() => {
    let next = stores.filter((store) =>
      isSellerRequestScope ? store.approvalStatus !== 'APPROVED' : store.approvalStatus === 'APPROVED',
    );

    if (activeTab !== 'all') {
      next = next.filter((store) => {
        if (activeTab === 'pending') return store.approvalStatus === 'PENDING';
        if (activeTab === 'active') return store.approvalStatus === 'APPROVED' && store.operatingStatus === 'ACTIVE';
        if (activeTab === 'suspended') return store.approvalStatus === 'APPROVED' && store.operatingStatus === 'SUSPENDED';
        return store.approvalStatus === 'REJECTED';
      });
    }

    if (!isSellerRequestScope && scaleFilter !== 'all') {
      next = next.filter((store) => {
        if (scaleFilter === 'hasProducts') return store.productCount > 0;
        if (scaleFilter === 'live') return store.liveProductCount > 0;
        return store.liveProductCount === 0;
      });
    }
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      next = next.filter((store) =>
        `${store.name} ${store.slug} ${store.applicantName || ''} ${store.applicantEmail || ''} ${store.contactEmail || ''} ${store.phone || ''}`
          .toLowerCase()
          .includes(query),
      );
    }
    return next;
  }, [activeTab, isSellerRequestScope, scaleFilter, search, stores]);

  const counts = useMemo(() => ({
    all: stores.length,
    approved: stores.filter((store) => store.approvalStatus === 'APPROVED').length,
    requests: stores.filter((store) => store.approvalStatus !== 'APPROVED').length,
    pending: stores.filter((store) => store.approvalStatus === 'PENDING').length,
    active: stores.filter((store) => store.approvalStatus === 'APPROVED' && store.operatingStatus === 'ACTIVE').length,
    suspended: stores.filter((store) => store.approvalStatus === 'APPROVED' && store.operatingStatus === 'SUSPENDED').length,
    rejected: stores.filter((store) => store.approvalStatus === 'REJECTED').length,
  }), [stores]);

  const approvedStores = useMemo(() => stores.filter((store) => store.approvalStatus === 'APPROVED'), [stores]);
  const scaleCounts: Record<StoreScaleFilter, number> = {
    all: approvedStores.length,
    hasProducts: approvedStores.filter((store) => store.productCount > 0).length,
    live: approvedStores.filter((store) => store.liveProductCount > 0).length,
    noLive: approvedStores.filter((store) => store.liveProductCount === 0).length,
  };
  const statusCounts: Record<StoreFilter, number> = {
    all: isSellerRequestScope ? counts.requests : counts.approved,
    pending: counts.pending,
    active: counts.active,
    suspended: counts.suspended,
    rejected: counts.rejected,
  };
  const hasStoreViewContext = storeScope !== 'activeStores' || view.hasViewContext;
  const activeStorePanelTitle =
    activeTab === 'suspended' ? 'Gian hàng tạm khóa' : activeTab === 'all' ? 'Gian hàng đã duyệt' : 'Gian hàng đang hoạt động';
  const sellerRequestPanelTitle =
    activeTab === 'rejected'
      ? 'Yêu cầu trở thành Vendor đã từ chối'
      : activeTab === 'all'
        ? 'Tất cả yêu cầu trở thành Vendor'
        : 'Đơn yêu cầu trở thành Vendor';
  const panelTitle = isSellerRequestScope ? sellerRequestPanelTitle : activeStorePanelTitle;
  const searchPlaceholder = isSellerRequestScope
    ? 'Tìm yêu cầu theo gian hàng, chủ sở hữu, email hoặc số điện thoại'
    : 'Tìm gian hàng, chủ sở hữu, email hoặc số điện thoại';
  const statusFilterLabel = isSellerRequestScope ? 'Tình trạng hồ sơ' : 'Trạng thái vận hành';
  const emptyTitle = isSellerRequestScope ? 'Chưa có yêu cầu trở thành Vendor' : 'Chưa có gian hàng phù hợp';
  const emptyDescription = isSellerRequestScope
    ? 'Các hồ sơ đăng ký bán hàng mới sẽ hiển thị tại đây để admin phê duyệt.'
    : 'Các gian hàng đã duyệt sẽ hiển thị tại đây để admin theo dõi và vận hành.';

  const totalPages = Math.max(Math.ceil(filteredStores.length / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const pagedStores = useMemo(() => filteredStores.slice((safePage - 1) * pageSize, safePage * pageSize), [filteredStores, safePage]);

  const resetCurrentView = () => {
    setSelected(new Set());
    setDetailStore(null);
    setStoreScope('activeStores');
    view.resetCurrentView();
  };

  const changeStoreView = (scope: StoreScope, status: StoreFilter) => {
    setStoreScope(scope);
    setSelected(new Set());
    setDetailStore(null);
    view.setStatus(status);
  };

  const changeScope = (key: string) => {
    const nextScope = key === 'sellerRequests' ? 'sellerRequests' : 'activeStores';
    changeStoreView(nextScope, nextScope === 'sellerRequests' ? 'pending' : 'active');
  };

  const changeTab = (key: string) => {
    setSelected(new Set());
    setDetailStore(null);
    view.setStatus(key);
  };

  const changeSearch = (value: string) => {
    setSelected(new Set());
    setDetailStore(null);
    view.setSearch(value);
  };

  const changeScale = (value: string) => {
    setSelected(new Set());
    setDetailStore(null);
    view.setExtra('scale', value);
  };

  const openConfirm = (mode: ConfirmMode, ids: string[]) => {
    const items = stores.filter((store) => ids.includes(store.id));
    if (items.length === 0) return;
    setConfirmState({ mode, ids: items.map((item) => item.id), selectedItems: items.map((item) => item.name) });
  };

  const approveStores = async () => {
    if (!confirmState) return;
    setActionLoading(true);
    try {
      const items = stores.filter((store) => confirmState.ids.includes(store.id));
      for (const store of items) {
        const response = await storeService.approveStore(store.id);
        setStores((prev) => prev.map((item) => item.id === response.storeId ? { ...item, approvalStatus: 'APPROVED', status: 'ACTIVE', operatingStatus: 'ACTIVE', rejectionReason: undefined } : item));
        if (detailStore?.id === response.storeId) setDetailStore((current) => current ? { ...current, approvalStatus: 'APPROVED', status: 'ACTIVE', operatingStatus: 'ACTIVE', rejectionReason: undefined } : null);
      }
      setSelected(new Set()); setConfirmState(null);
      addToast('Đã phê duyệt gian hàng đã chọn', 'success');
    } catch (error: unknown) { addToast(getUiErrorMessage(error, 'Phê duyệt gian hàng thất bại'), 'error'); }
    finally { setActionLoading(false); }
  };

  const rejectStore = async () => {
    if (!detailStore) return;
    if (!rejectReason.trim()) { addToast('Vui lòng nhập lý do từ chối hồ sơ gian hàng', 'error'); return; }
    setActionLoading(true);
    try {
      await storeService.rejectStore(detailStore.id, rejectReason.trim());
      setStores((prev) => prev.map((store) => store.id === detailStore.id ? { ...store, approvalStatus: 'REJECTED', rejectionReason: rejectReason.trim(), status: 'INACTIVE', operatingStatus: 'INACTIVE', liveProductCount: 0 } : store));
      setDetailStore((current) => current ? { ...current, approvalStatus: 'REJECTED', rejectionReason: rejectReason.trim(), status: 'INACTIVE', operatingStatus: 'INACTIVE', liveProductCount: 0 } : null);
      setSelected((prev) => { const next = new Set(prev); next.delete(detailStore.id); return next; });
      addToast('Đã từ chối hồ sơ gian hàng', 'info');
    } catch (error: unknown) { addToast(getUiErrorMessage(error, 'Từ chối hồ sơ gian hàng thất bại'), 'error'); }
    finally { setActionLoading(false); }
  };

  const applyStoreOperatingChange = async () => {
    if (!confirmState) return;
    setActionLoading(true);
    try {
      const nextStatus = confirmState.mode === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
      for (const storeId of confirmState.ids) {
        if (confirmState.mode === 'suspend') await storeService.suspendStore(storeId);
        else await storeService.reactivateStore(storeId);
      }
      setStores((prev) => prev.map((store) => confirmState.ids.includes(store.id) ? { ...store, operatingStatus: nextStatus, status: nextStatus } : store));
      if (detailStore && confirmState.ids.includes(detailStore.id)) setDetailStore((current) => current ? { ...current, operatingStatus: nextStatus, status: nextStatus } : null);
      addToast(confirmState.mode === 'suspend' ? 'Đã tạm khóa gian hàng đã chọn' : 'Đã mở lại gian hàng đã chọn', confirmState.mode === 'suspend' ? 'info' : 'success');
      setSelected(new Set()); setConfirmState(null);
    } catch (error: unknown) { addToast(getUiErrorMessage(error, 'Không thể cập nhật trạng thái gian hàng'), 'error'); }
    finally { setActionLoading(false); }
  };

  const resetCommissionRateToDefault = async () => {
    if (!detailStore) return;

    setResettingCommissionRate(true);
    try {
      const updatedStore = await storeService.resetStoreCommissionRateToDefault(detailStore.id);
      const mappedStore = mapStore(updatedStore);
      setStores((prev) =>
        prev.map((store) =>
          store.id === mappedStore.id
            ? {
              ...store,
              ...mappedStore,
              productCount: store.productCount,
              liveProductCount: store.liveProductCount,
              totalOrders: store.totalOrders,
              totalSales: store.totalSales,
              rating: store.rating,
              responseRate: store.responseRate,
            }
            : store,
        ),
      );
      setDetailStore((current) =>
        current && current.id === mappedStore.id
          ? {
            ...current,
            ...mappedStore,
            productCount: current.productCount,
            liveProductCount: current.liveProductCount,
            totalOrders: current.totalOrders,
            totalSales: current.totalSales,
            rating: current.rating,
            responseRate: current.responseRate,
          }
          : current,
      );
      addToast('Đã đưa gian hàng về phí hoa hồng mặc định toàn sàn.', 'success');
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể đưa gian hàng về phí mặc định.'), 'error');
    } finally {
      setResettingCommissionRate(false);
    }
  };

  return (
    <AdminLayout
      title="Gian hàng"
      breadcrumbs={['Gian hàng', 'Quản lý gian hàng']}
    >
      <PanelTabs
        items={STORE_SCOPE_TABS}
        activeKey={storeScope}
        onChange={changeScope}
      />
      <PanelStatsGrid items={[
        { key: 'active', label: 'Đang hoạt động', value: counts.active, sub: 'Gian hàng đã duyệt và đang bán', tone: 'success', onClick: () => changeStoreView('activeStores', 'active') },
        { key: 'pending', label: 'Yêu cầu trở thành Vendor', value: counts.pending, sub: 'Hồ sơ mới cần phê duyệt', tone: counts.pending > 0 ? 'warning' : '', onClick: () => changeStoreView('sellerRequests', 'pending') },
        { key: 'suspended', label: 'Tạm khóa', value: counts.suspended, sub: 'Gian hàng bị chặn vận hành tạm thời', tone: counts.suspended > 0 ? 'danger' : '', onClick: () => changeStoreView('activeStores', 'suspended') },
        { key: 'rejected', label: 'Đã từ chối', value: counts.rejected, sub: 'Yêu cầu trở thành Vendor không được duyệt', tone: counts.rejected > 0 ? 'danger' : '', onClick: () => changeStoreView('sellerRequests', 'rejected') },
      ]} />
      <section className="admin-panels single"><div className="admin-panel"><div className="admin-panel-head">
        <h2>{panelTitle}</h2>
      </div>
        <div className="admin-filter-toolbar">
          <PanelSearchField
            placeholder={searchPlaceholder}
            ariaLabel={searchPlaceholder}
            value={search}
            onChange={changeSearch}
          />
          <PanelFilterSelect
            label={statusFilterLabel}
            ariaLabel={`Lọc ${panelTitle.toLowerCase()} theo trạng thái`}
            items={statusTabs.map((tab) => ({ key: tab.key, label: tab.label, count: statusCounts[tab.key] }))}
            value={activeTab}
            onChange={changeTab}
          />
          {!isSellerRequestScope ? (
            <PanelFilterSelect
              label="Quy mô"
              ariaLabel="Lọc gian hàng theo quy mô vận hành"
              items={SCALE_FILTERS.map((item) => ({ key: item.key, label: item.label, count: scaleCounts[item.key] }))}
              value={scaleFilter}
              onChange={changeScale}
            />
          ) : null}
          {hasStoreViewContext ? (
            <button type="button" className="admin-filter-reset" onClick={resetCurrentView}>
              Đặt lại
            </button>
          ) : null}
        </div>
        {!loading && loadError ? (<AdminStateBlock type="error" title="Không tải được danh sách gian hàng" description={loadError} actionLabel="Thử lại" onAction={() => setReloadKey((value) => value + 1)} />) : null}
        {!loading && !loadError && filteredStores.length === 0 ? (<AdminStateBlock type={search.trim() ? 'search-empty' : 'empty'} title={search.trim() ? 'Không tìm thấy dữ liệu phù hợp' : emptyTitle} description={search.trim() ? 'Thử đổi từ khóa hoặc đặt lại bộ lọc để xem lại danh sách.' : emptyDescription} actionLabel="Đặt lại bộ lọc" onAction={resetCurrentView} />) : null}
        {!loading && !loadError && filteredStores.length > 0 ? (<><div className="admin-table admin-responsive-table" role="table" aria-label="Bảng gian hàng"><div className="admin-table-row stores admin-table-head" role="row">
          <div role="columnheader"><input type="checkbox" checked={selected.size === filteredStores.length && filteredStores.length > 0} onChange={(event) => setSelected(event.target.checked ? new Set(filteredStores.map((i) => i.id)) : new Set())} /></div>
          <div role="columnheader">STT</div>
          <div role="columnheader">Gian hàng</div><div role="columnheader">Chủ sở hữu</div><div role="columnheader">Quy mô vận hành</div><div role="columnheader">Trạng thái</div><div role="columnheader">Ngày tạo</div><div role="columnheader">Hành động</div>
        </div>{pagedStores.map((store, index) => (<motion.div key={store.id} className="admin-table-row stores" role="row" whileHover={{ y: -1 }} onClick={() => { setDetailStore(store); setRejectReason(store.rejectionReason || ''); }} style={{ cursor: 'pointer' }}>
          <div role="cell" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(store.id)} onChange={(e) => { const n = new Set(selected); if (e.target.checked) n.add(store.id); else n.delete(store.id); setSelected(n); }} /></div>
          <div role="cell" className="admin-mono">{(safePage - 1) * pageSize + index + 1}</div>
          <div role="cell" className="store-cell"><div className="store-avatar">{store.logo ? <img src={store.logo} alt={store.name} /> : <Store size={18} />}</div><div className="store-copy"><div className="admin-bold">{store.name}</div><div className="admin-muted small">{store.slug}</div></div></div>
          <div role="cell"><div className="admin-bold">{store.applicantName || 'Chưa đăng ký chủ sở hữu'}</div><div className="admin-muted small">{store.applicantEmail || store.contactEmail || 'Chưa có email'}</div></div>
          <div role="cell" className="store-ops-cell"><div className="admin-bold">{store.productCount.toLocaleString('vi-VN')} SKU</div><div className="admin-muted small">{store.liveProductCount.toLocaleString('vi-VN')} Đang bán · {store.totalOrders.toLocaleString('vi-VN')} đơn</div></div>
          <div role="cell">
            <span className={`admin-pill ${isSellerRequestScope ? approvalTone(store.approvalStatus) : operatingTone(store.operatingStatus)}`}>
              {isSellerRequestScope ? approvalLabel(store.approvalStatus) : operatingLabel(store.operatingStatus)}
            </span>
          </div>
          <div role="cell">{new Date(store.createdAt).toLocaleDateString('vi-VN')}</div>
          <div role="cell" className="admin-actions" onClick={(e) => e.stopPropagation()}>
            <button className="admin-icon-btn subtle" title="Xem hồ sơ gian hàng" aria-label="Xem hồ sơ gian hàng" onClick={() => { setDetailStore(store); setRejectReason(store.rejectionReason || ''); }}><Eye size={16} /></button>
            {store.approvalStatus === 'PENDING' ? <button className="admin-icon-btn subtle success-icon" title="Duyệt gian hàng" aria-label="Duyệt gian hàng" onClick={() => openConfirm('approve', [store.id])}><Check size={16} /></button> : null}
            {store.approvalStatus === 'APPROVED' && store.operatingStatus === 'ACTIVE' ? <button className="admin-icon-btn subtle danger-icon" title="Tạm khóa gian hàng" aria-label="Tạm khóa gian hàng" onClick={() => openConfirm('suspend', [store.id])}><Ban size={16} /></button> : null}
            {store.approvalStatus === 'APPROVED' && store.operatingStatus === 'SUSPENDED' ? <button className="admin-icon-btn subtle" title="Mở lại gian hàng" aria-label="Mở lại gian hàng" onClick={() => openConfirm('reactivate', [store.id])}><RotateCcw size={16} /></button> : null}
          </div></motion.div>))}</div>
          <div className="admin-mobile-cards" aria-label="Danh sách gian hàng dạng thẻ">
            {pagedStores.map((store) => (
              <article key={store.id} className="admin-mobile-card">
                <div className="admin-mobile-card-head">
                  <div className="admin-mobile-card-title">
                    <div className="store-avatar">{store.logo ? <img src={store.logo} alt={store.name} /> : <Store size={18} />}</div>
                    <div className="admin-mobile-card-title-main">
                      <p className="admin-bold">{store.name}</p>
                      <p className="admin-mobile-card-sub">{store.slug}</p>
                    </div>
                  </div>
                  <span className={`admin-pill ${isSellerRequestScope ? approvalTone(store.approvalStatus) : operatingTone(store.operatingStatus)}`}>
                    {isSellerRequestScope ? approvalLabel(store.approvalStatus) : operatingLabel(store.operatingStatus)}
                  </span>
                </div>
                <div className="admin-mobile-card-grid">
                  <div className="admin-mobile-card-field">
                    <span>Chủ sở hữu</span>
                    <strong>{store.applicantName || 'Chưa đăng ký chủ sở hữu'}</strong>
                    <p>{store.applicantEmail || store.contactEmail || 'Chưa có email'}</p>
                  </div>
                  <div className="admin-mobile-card-field">
                    <span>Quy mô</span>
                    <strong>{store.productCount.toLocaleString('vi-VN')} SKU</strong>
                    <p>{store.liveProductCount.toLocaleString('vi-VN')} đang bán · {store.totalOrders.toLocaleString('vi-VN')} đơn</p>
                  </div>
                  <div className="admin-mobile-card-field">
                    <span>GMV</span>
                    <strong>{formatCurrency(store.totalSales)}</strong>
                  </div>
                  <div className="admin-mobile-card-field">
                    <span>Ngày tạo</span>
                    <strong>{new Date(store.createdAt).toLocaleDateString('vi-VN')}</strong>
                  </div>
                </div>
                <div className="admin-mobile-card-actions">
                  <button className="admin-primary-btn" type="button" onClick={() => { setDetailStore(store); setRejectReason(store.rejectionReason || ''); }}>
                    <Eye size={16} />
                    Xem hồ sơ
                  </button>
                  {store.approvalStatus === 'PENDING' ? <button className="admin-icon-btn subtle success-icon" title="Duyệt gian hàng" aria-label="Duyệt gian hàng" onClick={() => openConfirm('approve', [store.id])}><Check size={16} /></button> : null}
                  {store.approvalStatus === 'APPROVED' && store.operatingStatus === 'ACTIVE' ? <button className="admin-icon-btn subtle danger-icon" title="Tạm khóa gian hàng" aria-label="Tạm khóa gian hàng" onClick={() => openConfirm('suspend', [store.id])}><Ban size={16} /></button> : null}
                  {store.approvalStatus === 'APPROVED' && store.operatingStatus === 'SUSPENDED' ? <button className="admin-icon-btn subtle" title="Mở lại gian hàng" aria-label="Mở lại gian hàng" onClick={() => openConfirm('reactivate', [store.id])}><RotateCcw size={16} /></button> : null}
                </div>
              </article>
            ))}
          </div>
          <PanelTableFooter
            meta={`Hiển thị ${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, filteredStores.length)} trên ${filteredStores.length} gian hàng`}
            page={safePage}
            totalPages={totalPages}
            onPageChange={view.setPage}
            prevLabel="Trước"
            nextLabel="Sau"
          /></>) : null}</div></section>
      <AdminConfirmDialog open={Boolean(confirmState)} title={confirmState?.mode === 'approve' ? 'Phê duyệt gian hàng' : confirmState?.mode === 'suspend' ? 'Tạm khóa gian hàng' : 'Mở lại gian hàng'} description={confirmState?.mode === 'approve' ? 'Chủ sở hữu sẽ được kích hoạt quyền người bán và gian hàng chuyển sang trạng thái hoạt động.' : confirmState?.mode === 'suspend' ? 'Gian hàng sẽ bị chặn vận hành tạm thời trên sàn cho đến khi mở lại.' : 'Gian hàng sẽ được mở lại hoạt động và tiếp tục hiển thị trên sàn.'} selectedItems={confirmState?.selectedItems} selectedNoun="gian hàng" confirmLabel={actionLoading ? 'Đang xử lý...' : confirmState?.mode === 'approve' ? 'Duyệt gian hàng' : confirmState?.mode === 'suspend' ? 'Tạm khóa gian hàng' : 'Mở lại gian hàng'} danger={confirmState?.mode === 'suspend'} onCancel={() => setConfirmState(null)} onConfirm={() => { if (!confirmState) return; if (confirmState.mode === 'approve') { void approveStores(); return; } void applyStoreOperatingChange(); }} />
      <Drawer
        open={Boolean(detailStore)}
        onClose={() => {
          setDetailStore(null);
          setRejectReason('');
        }}
        className="store-drawer"
        size="lg"
        ariaLabel="Hồ sơ gian hàng"
      >
        {detailStore ? (
          <>
            <PanelDrawerHeader
              eyebrow="Hồ sơ gian hàng"
              title={detailStore.name}
              onClose={() => {
                setDetailStore(null);
                setRejectReason('');
              }}
              closeLabel="Đóng hồ sơ gian hàng"
            />
            <div className="drawer-body">
              <PanelDrawerSection title="Tổng quan gian hàng">
                <div className="store-drawer-hero">
                  <div className="store-avatar large">
                    {detailStore.logo ? (
                      <img src={detailStore.logo} alt={detailStore.name} />
                    ) : (
                      <Store size={22} />
                    )}
                  </div>
                  <div>
                    <div className="admin-bold">{detailStore.name}</div>
                    <div className="admin-muted">{detailStore.slug}</div>
                  </div>
                  <div className="store-hero-pills">
                    <span className={`admin-pill ${approvalTone(detailStore.approvalStatus)}`}>
                      {approvalLabel(detailStore.approvalStatus)}
                    </span>
                    <span className={`admin-pill ${operatingTone(detailStore.operatingStatus)}`}>
                      {operatingLabel(detailStore.operatingStatus)}
                    </span>
                  </div>
                </div>
              </PanelDrawerSection>

              <PanelDrawerSection title="Hồ sơ và chủ sở hữu">
                <div className="store-profile-grid">
                  {buildStoreProfileFields(detailStore).map((field) => (
                    <div key={field.key} className={`store-profile-card ${field.span === 'full' ? 'full' : ''}`}>
                      <span className="admin-muted small">{field.label}</span>
                      <strong>{field.value}</strong>
                    </div>
                  ))}
                </div>
              </PanelDrawerSection>

              <PanelDrawerSection title="Quản lý phí sàn">
                <div className="store-commission-panel">
                  <div className="store-commission-summary">
                    <div className="admin-bold store-commission-title">Tỷ lệ hoa hồng áp dụng</div>
                    <span className={`store-commission-mode ${detailStore.usesDefaultCommissionRate ? 'default' : 'override'}`}>
                      {detailStore.usesDefaultCommissionRate ? 'Dùng mặc định toàn sàn' : 'Override riêng'}
                    </span>
                    <p className="admin-muted small">
                      Hiện tại: {detailStore.effectiveCommissionRate ?? detailStore.commissionRate ?? 5}%
                    </p>
                  </div>
                  <div className="store-commission-controls">
                    <label className="store-commission-input">
                      <span className="admin-muted small">Phần trăm (%)</span>
                      <input
                        className="admin-input"
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={commissionRateInput}
                        onChange={(e) => setCommissionRateInput(e.target.value)}
                        aria-label="Tỷ lệ hoa hồng riêng cho gian hàng"
                      />
                    </label>
                    {!detailStore.usesDefaultCommissionRate ? (
                      <button
                        type="button"
                        className="admin-ghost-btn store-commission-reset"
                        onClick={() => void resetCommissionRateToDefault()}
                        disabled={resettingCommissionRate}
                      >
                        {resettingCommissionRate ? 'Đang reset...' : 'Dùng mặc định'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </PanelDrawerSection>

              <PanelDrawerSection title="Tín hiệu kinh doanh">
                <div className="store-signal-grid">
                  {buildStoreSignalCards(detailStore).map((card) => (
                    <div key={card.key} className="store-signal-card">
                      <span className="admin-muted small">{card.label}</span>
                      <strong>{card.value}</strong>
                      <span className="admin-muted small">{card.sub}</span>
                    </div>
                  ))}
                </div>
              </PanelDrawerSection>

              <PanelDrawerSection title="Mô tả gian hàng">
                <div className="report-drawer-note" style={{ marginTop: 0, padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <p className="review-drawer-content" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#334155' }}>
                    {detailStore.description?.trim() || 'Chưa có mô tả gian hàng.'}
                  </p>
                </div>
              </PanelDrawerSection>

              <PanelDrawerSection title="Ghi chú kiểm duyệt">
                {detailStore.approvalStatus === 'PENDING' || detailStore.approvalStatus === 'REJECTED' ? (
                  <textarea
                    className="admin-textarea store-reject-note"
                    rows={4}
                    placeholder="Nhập ghi chú hoặc lý do từ chối hồ sơ gian hàng"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                ) : (
                  <div className="admin-card-list">
                    <div className="admin-card-row">
                      <span className="admin-bold">Ghi chú hiện tại</span>
                      <span className="admin-muted">
                        {detailStore.rejectionReason || 'Chưa có ghi chú kiểm duyệt. Gian hàng đang hoạt động bình thường.'}
                      </span>
                    </div>
                  </div>
                )}
              </PanelDrawerSection>
            </div>

            <PanelDrawerFooter>
              <button
                className="admin-ghost-btn"
                onClick={() => {
                  setDetailStore(null);
                  setRejectReason('');
                }}
              >
                Đóng
              </button>
              {detailStore.approvalStatus === 'PENDING' && (
                <button
                  className="admin-ghost-btn danger"
                  disabled={actionLoading}
                  onClick={() => void rejectStore()}
                >
                  <X size={14} /> Từ từ hồ sơ
                </button>
              )}
              {detailStore.approvalStatus === 'PENDING' && (
                <button
                  className="admin-primary-btn"
                  disabled={actionLoading}
                  onClick={() => openConfirm('approve', [detailStore.id])}
                >
                  <Check size={14} /> Duyệt gian hàng
                </button>
              )}
              {detailStore.approvalStatus === 'APPROVED' && detailStore.operatingStatus === 'ACTIVE' && (
                <button
                  className="admin-ghost-btn danger"
                  onClick={() => openConfirm('suspend', [detailStore.id])}
                >
                  <Ban size={14} /> Tạm khóa gian hàng
                </button>
              )}
              {detailStore.approvalStatus === 'APPROVED' && detailStore.operatingStatus === 'SUSPENDED' && (
                <button
                  className="admin-primary-btn"
                  onClick={() => openConfirm('reactivate', [detailStore.id])}
                >
                  <RotateCcw size={14} /> Mở lại gian hàng
                </button>
              )}
            </PanelDrawerFooter>
          </>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
};

export default StoreApprovals;
