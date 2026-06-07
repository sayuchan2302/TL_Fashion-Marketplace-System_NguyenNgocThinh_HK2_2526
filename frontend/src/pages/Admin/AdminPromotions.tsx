import './Admin.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pencil, Pause, Play, X, Trash2 } from 'lucide-react';
import AdminLayout from './AdminLayout';
import { AdminStateBlock } from './AdminStateBlocks';
import AdminConfirmDialog from './AdminConfirmDialog';
import { useAdminListState } from './useAdminListState';
import { ADMIN_VIEW_KEYS } from './adminListView';
import { useAdminViewState } from './useAdminViewState';
import { useAdminToast } from './useAdminToast';
import { PanelFilterSelect, PanelSearchField, PanelTableFooter } from '../../components/Panel/PanelPrimitives';
import Drawer from '../../components/Drawer/Drawer';
import {
  adminPromotionService,
  type AdminPromotionDiscountType,
  type AdminPromotionRecord,
  type AdminPromotionStatus,
  type AdminPromotionUpsertInput,
} from '../../services/adminPromotionService';
import { promotionStatusClass, promotionStatusLabel } from './adminStatusMaps';
import { storeService, type StoreProfile } from '../../services/storeService';

interface PromotionFormState extends AdminPromotionUpsertInput {
  id?: string;
}

interface PromotionTableRow {
  key: string;
  campaignKey: string;
  promotion: AdminPromotionRecord;
  memberPromotions: AdminPromotionRecord[];
  isGlobalCampaign: boolean;
}

type PromotionScopeFilter = 'all' | 'global' | 'vendor';

const PROMOTION_SCOPE_FILTERS: Array<{ key: PromotionScopeFilter; label: string }> = [
  { key: 'all', label: 'Tất cả phạm vi' },
  { key: 'global', label: 'Toàn sàn' },
  { key: 'vendor', label: 'Theo gian hàng' },
];

const validPromotionScopeFilters = new Set<PromotionScopeFilter>(PROMOTION_SCOPE_FILTERS.map((item) => item.key));

const emptyPromotion = (): PromotionFormState => ({
  storeId: '',
  name: '',
  code: '',
  description: '',
  discountType: 'percent',
  discountValue: 10,
  minOrderValue: 0,
  totalIssued: 1000,
  startDate: '',
  endDate: '',
  status: 'paused',
});

const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('vi-VN');
};

const normalizeCode = (value: string) => value.trim().replace(/\s+/g, '').toUpperCase();
const campaignScopeKey = (promotion: AdminPromotionRecord) =>
  [
    normalizeCode(promotion.code),
    promotion.discountType,
    Number(promotion.discountValue || 0).toFixed(4),
    Number(promotion.minOrderValue || 0).toFixed(2),
    promotion.startDate,
    promotion.endDate,
    promotion.status,
  ].join('|');

const toUpsertInput = (form: PromotionFormState, storeIdOverride?: string): AdminPromotionUpsertInput => ({
  storeId: storeIdOverride ?? form.storeId,
  name: form.name,
  code: form.code,
  description: form.description,
  discountType: form.discountType,
  discountValue: form.discountValue,
  minOrderValue: form.minOrderValue,
  totalIssued: form.totalIssued,
  startDate: form.startDate,
  endDate: form.endDate,
  status: form.status,
});

const deriveStatus = (promotion: AdminPromotionRecord): 'running' | 'paused' | 'expired' => {
  const endDate = new Date(promotion.endDate);
  if (!Number.isNaN(endDate.getTime())) {
    endDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (endDate < today) {
      return 'expired';
    }
  }

  if (promotion.status === 'running') return 'running';
  return 'paused';
};

const validateForm = (
  form: PromotionFormState,
  rows: AdminPromotionRecord[],
  editingIds: Set<string>,
) => {
  if (!form.name.trim()) return 'Tên chiến dịch không được để trống.';
  if (!form.code.trim()) return 'Mã voucher không được để trống.';
  if (!/^[A-Z0-9-]{3,24}$/.test(form.code)) {
    return 'Mã voucher phải từ 3-24 ký tự, chỉ gồm chữ hoa, số và dấu gạch ngang.';
  }

  const duplicatedVoucher = rows.find(
    (item) =>
      normalizeCode(item.code) === normalizeCode(form.code) &&
      !editingIds.has(item.id),
  );
  if (duplicatedVoucher) {
    return 'Mã voucher đã tồn tại trong hệ thống.';
  }
  if (form.discountValue <= 0) return 'Giá trị giảm phải lớn hơn 0.';
  if (form.discountType === 'percent' && form.discountValue > 100) {
    return 'Phần trăm giảm không được vượt 100%.';
  }
  if (form.minOrderValue < 0) return 'Giá trị đơn tối thiểu không hợp lệ.';
  if (form.totalIssued < 1) return 'Tổng số lượng phát hành phải lớn hơn 0.';
  if (!form.startDate || !form.endDate) return 'Hãy chọn đầy đủ lịch chiến dịch.';
  if (new Date(form.endDate) < new Date(form.startDate)) return 'Ngày kết thúc phải sau ngày bắt đầu.';
  return null;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

const AdminPromotions = () => {
  const view = useAdminViewState({
    storageKey: ADMIN_VIEW_KEYS.promotions,
    path: '/admin/promotions',
    validStatusKeys: ['all', 'running', 'paused', 'expired'],
    defaultStatus: 'all',
    extraFilters: [
      { key: 'scope', defaultValue: 'all', validate: (value) => validPromotionScopeFilters.has(value as PromotionScopeFilter) },
    ],
  });
  const scopeFilter = (validPromotionScopeFilters.has(view.extras.scope as PromotionScopeFilter) ? view.extras.scope : 'all') as PromotionScopeFilter;
  const [rows, setRows] = useState<AdminPromotionRecord[]>([]);
  const [stores, setStores] = useState<StoreProfile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingRows, setEditingRows] = useState<AdminPromotionRecord[]>([]);
  const [form, setForm] = useState<PromotionFormState>(emptyPromotion());
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast, pushToast } = useAdminToast();

  const selectableStores = useMemo(
    () => stores.filter((store) => store.approvalStatus === 'APPROVED'),
    [stores],
  );

  const globalCampaignKeys = useMemo(() => {
    const campaignCounts = new Map<string, number>();
    rows.forEach((item) => {
      const key = campaignScopeKey(item);
      campaignCounts.set(key, (campaignCounts.get(key) || 0) + 1);
    });

    const result = new Set<string>();
    campaignCounts.forEach((count, key) => {
      if (count > 1) {
        result.add(key);
      }
    });
    return result;
  }, [rows]);

  const tableRows = useMemo(() => {
    const groupedByCampaign = new Map<string, AdminPromotionRecord[]>();
    rows.forEach((item) => {
      const key = campaignScopeKey(item);
      const list = groupedByCampaign.get(key);
      if (list) {
        list.push(item);
      } else {
        groupedByCampaign.set(key, [item]);
      }
    });

    const emittedCampaignKeys = new Set<string>();
    const result: PromotionTableRow[] = [];

    rows.forEach((item) => {
      const key = campaignScopeKey(item);
      const isGlobalCampaign = globalCampaignKeys.has(key);

      if (!isGlobalCampaign) {
        result.push({
          key: item.id,
          campaignKey: key,
          promotion: item,
          memberPromotions: [item],
          isGlobalCampaign: false,
        });
        return;
      }

      if (emittedCampaignKeys.has(key)) {
        return;
      }
      emittedCampaignKeys.add(key);

      const members = groupedByCampaign.get(key) || [item];
      const representative = members[0] || item;
      result.push({
        key: `global:${key}`,
        campaignKey: key,
        promotion: representative,
        memberPromotions: members,
        isGlobalCampaign: true,
      });
    });

    return result;
  }, [rows, globalCampaignKeys]);

  const editingIds = useMemo(
    () => new Set(editingRows.map((item) => item.id)),
    [editingRows],
  );

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      const [promotionSnapshot, storeSnapshot] = await Promise.all([
        adminPromotionService.list({ page: 1, size: 300 }),
        storeService.getAdminStores(),
      ]);
      setRows(promotionSnapshot.items);
      setStores(storeSnapshot);
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error, 'Không thể tải dữ liệu khuyến mãi.'));
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const {
    search,
    isLoading,
    filteredItems,
    pagedItems,
    page,
    totalPages,
    startIndex,
    endIndex,
  } = useAdminListState<PromotionTableRow>({
    items: tableRows,
    pageSize: 7,
    searchValue: view.search,
    onSearchChange: view.setSearch,
    pageValue: view.page,
    onPageChange: view.setPage,
    getSearchText: (item) =>
      `${item.promotion.name} ${item.promotion.code} ${item.promotion.description} ${item.promotion.storeName} ${item.isGlobalCampaign ? 'toàn sàn' : ''}`,
    filterPredicate: (item) => {
      if (view.status !== 'all' && deriveStatus(item.promotion) !== view.status) return false;
      if (scopeFilter === 'global') return item.isGlobalCampaign;
      if (scopeFilter === 'vendor') return !item.isGlobalCampaign;
      return true;
    },
    loadingDeps: [view.status, scopeFilter],
  });

  const stats = useMemo(() => {
    const running = tableRows.filter((item) => deriveStatus(item.promotion) === 'running').length;
    const paused = tableRows.filter((item) => deriveStatus(item.promotion) === 'paused').length;
    const expired = tableRows.filter((item) => deriveStatus(item.promotion) === 'expired').length;
    const totalIssued = tableRows.reduce((sum, item) => sum + item.promotion.totalIssued, 0);
    const totalUsed = tableRows.reduce((sum, item) => sum + item.promotion.usedCount, 0);
    return {
      running,
      paused,
      expired,
      usageRate: totalIssued > 0 ? Math.round((totalUsed / totalIssued) * 100) : 0,
    };
  }, [tableRows]);

  const scopeCounts: Record<PromotionScopeFilter, number> = {
    all: tableRows.length,
    global: tableRows.filter((item) => item.isGlobalCampaign).length,
    vendor: tableRows.filter((item) => !item.isGlobalCampaign).length,
  };

  const resetView = () => {
    view.resetCurrentView();
    setSelected(new Set());
    pushToast('Đã đặt lại bộ lọc chiến dịch.');
  };

  const changeStatus = (key: string) => {
    setSelected(new Set());
    view.setStatus(key);
  };

  const changeScope = (key: string) => {
    setSelected(new Set());
    view.setExtra('scope', key);
  };

  const changeSearch = (value: string) => {
    setSelected(new Set());
    view.setSearch(value);
  };

  const openCreate = () => {
    setEditingRows([]);
    setForm({
      ...emptyPromotion(),
      storeId: '',
    });
    setIsDrawerOpen(true);
  };

  const openEdit = (row: PromotionTableRow) => {
    const representative = row.promotion;
    setEditingRows(row.memberPromotions);
    setForm({
      id: representative.id,
      storeId: representative.storeId,
      name: representative.name,
      code: representative.code,
      description: representative.description,
      discountType: representative.discountType,
      discountValue: representative.discountValue,
      minOrderValue: representative.minOrderValue,
      totalIssued: representative.totalIssued,
      startDate: representative.startDate,
      endDate: representative.endDate,
      status: representative.status,
    });
    setIsDrawerOpen(true);
  };

  const savePromotion = async () => {
    const error = validateForm(form, rows, editingIds);
    if (error) {
      pushToast(error);
      return;
    }

    try {
      setIsSubmitting(true);

      if (editingRows.length > 0) {
        await Promise.all(
          editingRows.map((item) =>
            adminPromotionService.update(item.id, toUpsertInput(form, item.storeId)),
          ),
        );
        pushToast(
          editingRows.length > 1
            ? `Đã cập nhật chiến dịch toàn sàn cho ${editingRows.length} gian hàng.`
            : 'Đã cập nhật chiến dịch.',
        );
      } else {
        const campaign = await adminPromotionService.createMarketplaceCampaign(toUpsertInput(form));
        if (campaign.createdCount <= 0) {
          throw new Error('Không thể tạo chiến dịch toàn sàn.');
        }
        if (campaign.failedCount > 0) {
          pushToast(`Đã tạo ${campaign.createdCount} voucher toàn sàn (${campaign.failedCount} gian hàng lỗi).`);
        } else {
          pushToast(`Đã tạo voucher toàn sàn cho ${campaign.createdCount} gian hàng.`);
        }
      }

      setIsDrawerOpen(false);
      setEditingRows([]);
      await loadData();
    } catch (error: unknown) {
      pushToast(getErrorMessage(error, 'Không thể lưu chiến dịch.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePause = async (row: PromotionTableRow) => {
    const nextStatus: AdminPromotionStatus = row.promotion.status === 'running' ? 'paused' : 'running';
    try {
      await Promise.all(
        row.memberPromotions.map((item) => adminPromotionService.updateStatus(item.id, nextStatus)),
      );
      await loadData();
    } catch (error: unknown) {
      pushToast(getErrorMessage(error, 'Không thể cập nhật trạng thái chiến dịch.'));
    }
  };

  const deleteSelected = async () => {
    if (!deleteIds?.length) return;
    try {
      await Promise.all(deleteIds.map((id) => adminPromotionService.delete(id)));
      setSelected(new Set());
      setDeleteIds(null);
      pushToast('Đã xóa chiến dịch khỏi hệ thống.');
      await loadData();
    } catch (error: unknown) {
      pushToast(getErrorMessage(error, 'Không thể xóa chiến dịch.'));
    }
  };

  return (
    <AdminLayout
      title="Voucher toàn sàn"
      breadcrumbs={['Voucher toàn sàn', 'Chiến dịch điều hành']}
      actions={
        <button className="admin-primary-btn" onClick={openCreate} disabled={selectableStores.length === 0}>
          <Plus size={16} /> Tạo Voucher
        </button>
      }
    >
      <div className="admin-stats grid-4">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Tổng chiến dịch</div>
          <div className="admin-stat-value">{tableRows.length}</div>
          <div className="admin-stat-sub">Tỷ lệ sử dụng toàn sàn: {stats.usageRate}%</div>
        </div>
        <div className="admin-stat-card success" onClick={() => changeStatus('running')} style={{ cursor: 'pointer' }}>
          <div className="admin-stat-label">Đang chạy</div>
          <div className="admin-stat-value">{stats.running}</div>
          <div className="admin-stat-sub">Chiến dịch đang hoạt động</div>
        </div>
        <div className="admin-stat-card warning" onClick={() => changeStatus('paused')} style={{ cursor: 'pointer' }}>
          <div className="admin-stat-label">Tạm dừng</div>
          <div className="admin-stat-value">{stats.paused}</div>
          <div className="admin-stat-sub">Tạm ngưng hoặc draft</div>
        </div>
        <div className="admin-stat-card danger" onClick={() => changeStatus('expired')} style={{ cursor: 'pointer' }}>
          <div className="admin-stat-label">Hết hạn</div>
          <div className="admin-stat-value">{stats.expired}</div>
          <div className="admin-stat-sub">Cần gia hạn hoặc dọn dẹp</div>
        </div>
      </div>

      <section className="admin-panels single">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Kho voucher</h2>
          </div>
          <div className="admin-filter-toolbar">
            <PanelSearchField
              placeholder="Tìm tên, mã voucher, mô tả hoặc gian hàng"
              ariaLabel="Tìm voucher"
              value={search}
              onChange={changeSearch}
            />
            <PanelFilterSelect
              label="Trạng thái"
              ariaLabel="Lọc voucher theo trạng thái"
              items={[
                { key: 'all', label: 'Tất cả', count: tableRows.length },
                { key: 'running', label: 'Đang chạy', count: stats.running },
                { key: 'paused', label: 'Tạm dừng', count: stats.paused },
                { key: 'expired', label: 'Hết hạn', count: stats.expired },
              ]}
              value={view.status}
              onChange={changeStatus}
            />
            <PanelFilterSelect
              label="Phạm vi"
              ariaLabel="Lọc voucher theo phạm vi áp dụng"
              items={PROMOTION_SCOPE_FILTERS.map((item) => ({ key: item.key, label: item.label, count: scopeCounts[item.key] }))}
              value={scopeFilter}
              onChange={changeScope}
            />
            {view.hasViewContext ? (
              <button type="button" className="admin-filter-reset" onClick={resetView}>
                Đặt lại
              </button>
            ) : null}
          </div>

          {isInitializing ? (
            <div className="admin-loading" style={{ padding: '3rem', textAlign: 'center' }}>Đang tải dữ liệu chiến dịch...</div>
          ) : loadError && tableRows.length === 0 ? (
            <AdminStateBlock
              type="error"
              title="Không thể tải chiến dịch"
              description={loadError}
              actionLabel="Thử lại"
              onAction={() => void loadData()}
            />
          ) : isLoading ? null : filteredItems.length === 0 ? (
            <AdminStateBlock
              type={search.trim() ? 'search-empty' : 'empty'}
              title={search.trim() ? 'Không tìm thấy chiến dịch phù hợp' : 'Chưa có chiến dịch'}
              description={search.trim() ? 'Thử đổi từ khóa hoặc đặt lại bộ lọc.' : 'Các voucher toàn sàn sẽ hiển thị tại đây khi backend có dữ liệu.'}
              actionLabel="Đặt lại"
              onAction={resetView}
            />
          ) : (
            <>
              <div className="admin-table admin-responsive-table" role="table" aria-label="Bảng chiến dịch toàn sàn">
                <div className="admin-table-row admin-table-head promotions" role="row">
                  <div role="columnheader">
                    <input
                      type="checkbox"
                      checked={selected.size === filteredItems.length && filteredItems.length > 0}
                      onChange={(e) => setSelected(e.target.checked ? new Set(filteredItems.map((item) => item.key)) : new Set())}
                    />
                  </div>
                  <div role="columnheader">STT</div>
                  <div role="columnheader">Chiến dịch</div>
                  <div role="columnheader">Phạm vi</div>
                  <div role="columnheader">Giá trị</div>
                  <div role="columnheader">Điều kiện</div>
                  <div role="columnheader">Đã sử dụng</div>
                  <div role="columnheader">Lịch trình</div>
                  <div role="columnheader">Trạng thái</div>
                  <div role="columnheader">Hành động</div>
                </div>
                {pagedItems.map((row, index) => {
                  const promo = row.promotion;
                  const usedPercent = promo.totalIssued > 0 ? Math.min(100, Math.round((promo.usedCount / promo.totalIssued) * 100)) : 0;
                  const currentStatus = deriveStatus(promo);
                  return (
                    <motion.div
                      key={row.key}
                      className="admin-table-row promotions"
                      role="row"
                      whileHover={{ y: -1 }}
                      onClick={() => openEdit(row)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div role="cell" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.key)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(row.key);
                            else next.delete(row.key);
                            setSelected(next);
                          }}
                        />
                      </div>
                      <div role="cell" className="admin-mono">{startIndex + index}</div>
                      <div role="cell">
                        <p className="admin-bold promo-name">{promo.name}</p>
                        <p className="admin-muted promo-code">{promo.code}</p>
                      </div>
                      <div role="cell">
                        <span className={`promo-scope-badge ${row.isGlobalCampaign ? 'global' : 'vendor'}`}>
                          {row.isGlobalCampaign ? 'Toàn sàn' : (promo.storeName || 'Store không xác định')}
                        </span>
                      </div>
                      <div role="cell">
                        <p className="admin-bold">
                          {promo.discountType === 'percent' ? `${promo.discountValue}%` : formatCurrency(promo.discountValue)}
                        </p>
                      </div>
                      <div role="cell">Đơn từ {formatCurrency(promo.minOrderValue)}</div>
                      <div role="cell">
                        <p className="admin-bold">{promo.usedCount}/{promo.totalIssued}</p>
                        <div className="promo-progress-track"><span style={{ width: `${usedPercent}%` }} /></div>
                      </div>
                      <div role="cell" className="admin-muted">{formatDate(promo.startDate)} - {formatDate(promo.endDate)}</div>
                      <div role="cell"><span className={`admin-pill ${promotionStatusClass(currentStatus)}`}>{promotionStatusLabel(currentStatus)}</span></div>
                      <div role="cell" className="admin-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="admin-icon-btn subtle" onClick={() => openEdit(row)}><Pencil size={16} /></button>
                        <button className="admin-icon-btn subtle" onClick={() => void togglePause(row)}>
                          {promo.status === 'running' ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <button className="admin-icon-btn subtle danger-icon" onClick={() => setDeleteIds(row.memberPromotions.map((item) => item.id))}><Trash2 size={16} /></button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              <div className="admin-mobile-cards" aria-label="Danh sách voucher dạng thẻ">
                {pagedItems.map((row) => {
                  const promo = row.promotion;
                  const usedPercent = promo.totalIssued > 0 ? Math.min(100, Math.round((promo.usedCount / promo.totalIssued) * 100)) : 0;
                  const currentStatus = deriveStatus(promo);

                  return (
                    <article key={row.key} className="admin-mobile-card">
                      <div className="admin-mobile-card-head">
                        <div className="admin-mobile-card-title">
                          <div className="admin-mobile-card-title-main">
                            <p className="admin-bold">{promo.name}</p>
                            <p className="admin-mobile-card-sub">{promo.code}</p>
                          </div>
                        </div>
                        <span className={`admin-pill ${promotionStatusClass(currentStatus)}`}>{promotionStatusLabel(currentStatus)}</span>
                      </div>
                      <div className="admin-mobile-card-grid">
                        <div className="admin-mobile-card-field">
                          <span>Phạm vi</span>
                          <strong>{row.isGlobalCampaign ? 'Toàn sàn' : (promo.storeName || 'Store không xác định')}</strong>
                        </div>
                        <div className="admin-mobile-card-field">
                          <span>Giá trị</span>
                          <strong>{promo.discountType === 'percent' ? `${promo.discountValue}%` : formatCurrency(promo.discountValue)}</strong>
                          <p>Đơn từ {formatCurrency(promo.minOrderValue)}</p>
                        </div>
                        <div className="admin-mobile-card-field">
                          <span>Đã sử dụng</span>
                          <strong>{promo.usedCount}/{promo.totalIssued}</strong>
                          <p>{usedPercent}%</p>
                        </div>
                        <div className="admin-mobile-card-field">
                          <span>Lịch trình</span>
                          <strong>{formatDate(promo.startDate)}</strong>
                          <p>{formatDate(promo.endDate)}</p>
                        </div>
                      </div>
                      <div className="admin-mobile-card-actions">
                        <button className="admin-primary-btn" type="button" onClick={() => openEdit(row)}>
                          <Pencil size={16} />
                          Chỉnh sửa
                        </button>
                        <button className="admin-icon-btn subtle" type="button" onClick={() => void togglePause(row)} aria-label={promo.status === 'running' ? 'Tạm dừng chiến dịch' : 'Kích hoạt chiến dịch'}>
                          {promo.status === 'running' ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <button className="admin-icon-btn subtle danger-icon" type="button" onClick={() => setDeleteIds(row.memberPromotions.map((item) => item.id))} aria-label="Xóa chiến dịch"><Trash2 size={16} /></button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {!isLoading && filteredItems.length > 0 && (
            <PanelTableFooter
              meta={`Hiển thị ${startIndex}-${endIndex} của ${filteredItems.length} chiến dịch`}
              page={page}
              totalPages={totalPages}
              onPageChange={view.setPage}
              prevLabel="Trước"
              nextLabel="Tiếp"
            />
          )}
        </div>
      </section>

      <AdminConfirmDialog
        open={Boolean(deleteIds?.length)}
        title="Xóa chiến dịch"
        description="Bạn chắc chắn muốn xóa chiến dịch đã chọn? Hành động này không thể hoàn tác."
        selectedNoun="chiến dịch"
        confirmLabel="Xóa chiến dịch"
        danger
        onCancel={() => setDeleteIds(null)}
        onConfirm={() => void deleteSelected()}
      />

      <Drawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        className="promo-drawer"
        size="md"
        ariaLabel="Tạo hoặc cập nhật chiến dịch"
      >
        <div className="drawer-header">
          <div>
            <p className="drawer-eyebrow">Chiến dịch nền tảng</p>
            <h3>{editingRows.length > 0 ? 'Cập nhật chiến dịch toàn sàn' : 'Tạo chiến dịch toàn sàn'}</h3>
          </div>
          <button className="admin-icon-btn" onClick={() => setIsDrawerOpen(false)} aria-label="Đóng"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          <section className="drawer-section">
            <h4>Thông tin</h4>
            <div className="form-grid">
              <label className="form-field">
                <span>Tên chiến dịch</span>
                <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
              </label>
              <label className="form-field">
                <span>Mã voucher</span>
                <input value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase().replace(/\s+/g, '') }))} />
              </label>
              <label className="form-field full">
                <span>Mô tả chiến dịch</span>
                <textarea rows={3} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
              </label>
            </div>
          </section>
          <section className="drawer-section">
            <h4>Giảm giá</h4>
            <div className="form-grid">
              <label className="form-field">
                <span>Loại giảm giá</span>
                <select value={form.discountType} onChange={(e) => setForm((prev) => ({ ...prev, discountType: e.target.value as AdminPromotionDiscountType }))}>
                  <option value="percent">Giảm %</option>
                  <option value="fixed">Giảm tiền</option>
                </select>
              </label>
              <label className="form-field">
                <span>Giá trị giảm</span>
                <input type="number" value={form.discountValue} onChange={(e) => setForm((prev) => ({ ...prev, discountValue: Number(e.target.value) || 0 }))} />
              </label>
              <label className="form-field">
                <span>Đơn tối thiểu</span>
                <input type="number" value={form.minOrderValue} onChange={(e) => setForm((prev) => ({ ...prev, minOrderValue: Number(e.target.value) || 0 }))} />
              </label>
              <label className="form-field">
                <span>Tổng số lượng phát hành</span>
                <input type="number" value={form.totalIssued} onChange={(e) => setForm((prev) => ({ ...prev, totalIssued: Number(e.target.value) || 0 }))} />
              </label>
              <label className="form-field">
                <span>Ngày bắt đầu</span>
                <input type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} />
              </label>
              <label className="form-field">
                <span>Ngày kết thúc</span>
                <input type="date" value={form.endDate} onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))} />
              </label>
              <label className="form-field">
                <span>Trạng thái</span>
                <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as AdminPromotionStatus }))}>
                  <option value="running">Đang chạy</option>
                  <option value="paused">Tạm dừng</option>
                  <option value="draft">Nháp</option>
                </select>
              </label>
            </div>
          </section>
        </div>
        <div className="drawer-footer">
          <button className="admin-ghost-btn" onClick={() => setIsDrawerOpen(false)}>Hủy</button>
          <button className="admin-primary-btn" onClick={() => void savePromotion()} disabled={isSubmitting}>Lưu chiến dịch</button>
        </div>
      </Drawer>

      {toast && <div className="toast success">{toast}</div>}
    </AdminLayout>
  );
};

export default AdminPromotions;
