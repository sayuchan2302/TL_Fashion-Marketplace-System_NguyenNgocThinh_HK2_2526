import './Vendor.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import VendorLayout from './VendorLayout';
import {
  PanelDrawerFooter,
  PanelDrawerHeader,
  PanelDrawerSection,
  PanelFilterSelect,
  PanelSearchField,
  PanelStatsGrid,
  PanelTableFooter,
} from '../../components/Panel/PanelPrimitives';
import { AdminStateBlock, AdminTableSkeleton } from '../Admin/AdminStateBlocks';
import AdminConfirmDialog from '../Admin/AdminConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import { getUiErrorMessage } from '../../utils/errorMessage';
import {
  vendorVoucherService,
  type VendorVoucherDiscountType,
  type VendorVoucherListResult,
  type VendorVoucherRecord,
  type VendorVoucherStatus,
  type VendorVoucherStatusFilter,
  type VendorVoucherUpsertInput,
} from '../../services/vendorVoucherService';
import Drawer from '../../components/Drawer/Drawer';
import { normalizePositiveInteger } from './vendorHelpers';

type VoucherTab = VendorVoucherStatusFilter;

interface VoucherFormState extends VendorVoucherUpsertInput {
  id?: string;
}

type DeleteState = {
  ids: string[];
  selectedItems: string[];
  title: string;
  description: string;
  confirmLabel: string;
};

const PAGE_SIZE = 8;

const TABS: Array<{ key: VoucherTab; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'running', label: 'Đang chạy' },
  { key: 'paused', label: 'Tạm dừng' },
  { key: 'draft', label: 'Bản nháp' },
];

const EMPTY_RESULT: VendorVoucherListResult = {
  items: [],
  totalElements: 0,
  totalPages: 1,
  page: 1,
  pageSize: PAGE_SIZE,
  totalUsage: 0,
  counts: {
    all: 0,
    running: 0,
    paused: 0,
    draft: 0,
  },
};

const normalizeTab = (value: string | null): VoucherTab => {
  if (value === 'running' || value === 'paused' || value === 'draft') {
    return value;
  }
  return 'all';
};

const normalizePage = (value: string | null): number => normalizePositiveInteger(value, 1);

const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const emptyVoucher = (): VoucherFormState => {
  const start = new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + 30);

  return {
    name: '',
    code: '',
    discountType: 'percent',
    discountValue: 10,
    minOrderValue: 0,
    totalIssued: 100,
    status: 'draft',
    startDate: formatDateInput(start),
    endDate: formatDateInput(end),
    description: '',
  };
};

const toStatusLabel = (status: VendorVoucherStatus) => {
  switch (status) {
    case 'running':
      return 'Đang chạy';
    case 'paused':
      return 'Tạm dừng';
    default:
      return 'Bản nháp';
  }
};

const toStatusClass = (status: VendorVoucherStatus) => {
  if (status === 'running') return 'success';
  if (status === 'paused') return 'pending';
  return 'neutral';
};

const validateVoucherForm = (form: VoucherFormState): string | null => {
  if (!form.name.trim()) return 'Tên voucher là bắt buộc';
  if (!form.code.trim()) return 'Mã voucher là bắt buộc';
  if (!form.startDate) return 'Cần chọn ngày bắt đầu';
  if (!form.endDate) return 'Cần chọn ngày kết thúc';
  if (form.endDate < form.startDate) return 'Ngày kết thúc phải sau ngày bắt đầu';
  if (!Number.isFinite(form.discountValue) || form.discountValue <= 0) return 'Giá trị giảm phải lớn hơn 0';
  if (!Number.isFinite(form.totalIssued) || form.totalIssued < 1) return 'Tổng phát hành phải từ 1 trở lên';
  if (!Number.isFinite(form.minOrderValue) || form.minOrderValue < 0) return 'Đơn tối thiểu không được âm';
  return null;
};

const toPayload = (form: VoucherFormState): VendorVoucherUpsertInput => ({
  name: form.name,
  code: form.code,
  description: form.description,
  discountType: form.discountType,
  discountValue: Number(form.discountValue),
  minOrderValue: Number(form.minOrderValue),
  totalIssued: Number(form.totalIssued),
  status: form.status,
  startDate: form.startDate,
  endDate: form.endDate,
});

const VendorPromotions = () => {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = normalizeTab(searchParams.get('status'));
  const currentPage = normalizePage(searchParams.get('page'));
  const keyword = (searchParams.get('q') || '').trim();

  const [searchInput, setSearchInput] = useState(keyword);
  const [result, setResult] = useState<VendorVoucherListResult>(EMPTY_RESULT);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [voucherForm, setVoucherForm] = useState<VoucherFormState>(emptyVoucher());
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState('');

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

  const setPage = useCallback(
    (page: number) => {
      updateQuery((query) => {
        query.set('page', String(Math.max(1, page)));
      });
    },
    [updateQuery],
  );

  const setTab = useCallback(
    (tab: VoucherTab) => {
      setSelected(new Set());
      updateQuery((query) => {
        if (tab === 'all') {
          query.delete('status');
        } else {
          query.set('status', tab);
        }
        query.set('page', '1');
      });
    },
    [updateQuery],
  );

  useEffect(() => {
    setSearchInput(keyword);
  }, [keyword]);

  useEffect(() => {
    if (searchInput.trim() === keyword) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSelected(new Set());
      updateQuery(
        (query) => {
          const normalized = searchInput.trim();
          if (normalized) {
            query.set('q', normalized);
          } else {
            query.delete('q');
          }
          query.set('page', '1');
        },
        true,
      );
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput, keyword, updateQuery]);

  const loadVouchers = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setLoadError('');

    try {
      const snapshot = await vendorVoucherService.list({
        status: activeTab,
        keyword,
        page: currentPage,
        size: PAGE_SIZE,
      });

      setResult(snapshot);
      setSelected((current) => {
        const availableIds = new Set(snapshot.items.map((item) => item.id));
        return new Set(Array.from(current).filter((id) => availableIds.has(id)));
      });

      if (currentPage > snapshot.totalPages) {
        setPage(snapshot.totalPages);
      }
    } catch (error: unknown) {
      const message = getUiErrorMessage(error, 'Không tải được danh sách voucher của shop');
      setLoadError(message);
      addToast(message, 'error');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [activeTab, addToast, currentPage, keyword, setPage]);

  useEffect(() => {
    void loadVouchers();
  }, [loadVouchers]);

  const stats = useMemo(
    () => ({
      running: result.counts.running,
      paused: result.counts.paused,
      draft: result.counts.draft,
      total: result.counts.all,
      totalUsage: result.totalUsage,
    }),
    [result],
  );



  const openCreate = () => {
    setVoucherForm(emptyVoucher());
    setDrawerOpen(true);
  };

  const openEdit = (voucher: VendorVoucherRecord) => {
    setVoucherForm({
      id: voucher.id,
      name: voucher.name,
      code: voucher.code,
      description: voucher.description,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      minOrderValue: voucher.minOrderValue,
      totalIssued: voucher.totalIssued,
      status: voucher.status,
      startDate: voucher.startDate,
      endDate: voucher.endDate,
    });
    setDrawerOpen(true);
  };

  const saveVoucher = async () => {
    const validationError = validateVoucherForm(voucherForm);
    if (validationError) {
      addToast(validationError, 'error');
      return;
    }

    setWorking(true);
    try {
      if (voucherForm.id) {
        await vendorVoucherService.update(voucherForm.id, toPayload(voucherForm));
        addToast('Đã cập nhật voucher shop', 'success');
      } else {
        await vendorVoucherService.create(toPayload(voucherForm));
        addToast('Đã tạo voucher mới', 'success');
      }

      setDrawerOpen(false);
      setSelected(new Set());

      if (!voucherForm.id && currentPage !== 1) {
        setPage(1);
      } else {
        await loadVouchers();
      }
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể lưu voucher'), 'error');
    } finally {
      setWorking(false);
    }
  };

  const requestDelete = (ids: string[]) => {
    const selectedRows = result.items.filter((voucher) => ids.includes(voucher.id));
    setDeleteState({
      ids,
      selectedItems: selectedRows.map((item) => item.name),
      title: ids.length > 1 ? 'Xóa các voucher đã chọn' : 'Xóa voucher shop',
      description: 'Voucher sẽ bị gỡ khỏi kênh người bán và không còn áp dụng cho shop.',
      confirmLabel: 'Xóa voucher',
    });
  };

  const confirmDelete = async () => {
    if (!deleteState) return;

    setWorking(true);
    try {
      await Promise.all(deleteState.ids.map((id) => vendorVoucherService.delete(id)));
      addToast('Đã xóa voucher', 'success');
      setDeleteState(null);
      setSelected(new Set());
      await loadVouchers();
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể xóa voucher'), 'error');
    } finally {
      setWorking(false);
    }
  };

  const updateVoucherStatus = async (ids: string[], explicitStatus?: VendorVoucherStatus) => {
    if (ids.length === 0) return;

    const vouchersById = new Map(result.items.map((voucher) => [voucher.id, voucher]));
    const updates = ids
      .map((id) => {
        const voucher = vouchersById.get(id);
        if (!voucher) return null;
        const nextStatus = explicitStatus || (voucher.status === 'running' ? 'paused' : 'running');
        return { id, status: nextStatus };
      })
      .filter((item): item is { id: string; status: VendorVoucherStatus } => Boolean(item));

    if (updates.length === 0) {
      return;
    }

    // 1. Cập nhật UI lạc quan (Optimistic UI Update) ngay lập tức không chờ API
    setResult((prev) => {
      const nextItems = prev.items.map((item) => {
        const update = updates.find((u) => u.id === item.id);
        if (update) {
          return { ...item, status: update.status };
        }
        return item;
      });

      const nextCounts = { ...prev.counts };
      updates.forEach((update) => {
        const oldVoucher = vouchersById.get(update.id);
        if (oldVoucher && oldVoucher.status !== update.status) {
          if (oldVoucher.status in nextCounts) {
            nextCounts[oldVoucher.status as keyof typeof nextCounts] = Math.max(
              0,
              nextCounts[oldVoucher.status as keyof typeof nextCounts] - 1
            );
          }
          if (update.status in nextCounts) {
            nextCounts[update.status as keyof typeof nextCounts] =
              nextCounts[update.status as keyof typeof nextCounts] + 1;
          }
        }
      });

      return {
        ...prev,
        items: nextItems,
        counts: nextCounts,
      };
    });

    try {
      await Promise.all(
        updates.map((item) => vendorVoucherService.updateStatus(item.id, item.status)),
      );
      setSelected(new Set());
      await loadVouchers(true); // Tải lại ngầm trong chế độ silent
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể cập nhật trạng thái voucher'), 'error');
      await loadVouchers(); // Nếu thất bại, tải lại đầy đủ có skeleton để đồng bộ dữ liệu chuẩn
    }
  };

  const resetCurrentView = () => {
    setSelected(new Set());
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  const startRow = result.totalElements === 0 ? 0 : (currentPage - 1) * result.pageSize + 1;
  const endRow = result.totalElements === 0 ? 0 : Math.min(currentPage * result.pageSize, result.totalElements);

  const statItems = [
    {
      key: 'all',
      label: 'Tổng voucher',
      value: stats.total,
      sub: `Lượt sử dụng: ${stats.totalUsage}`,
      onClick: () => setTab('all'),
    },
    {
      key: 'running',
      label: 'Đang chạy',
      value: stats.running,
      sub: 'Voucher đang tác động doanh thu',
      tone: 'success' as const,
      onClick: () => setTab('running'),
    },
    {
      key: 'paused',
      label: 'Tạm dừng',
      value: stats.paused,
      sub: 'Chờ kích hoạt lại khi cần',
      tone: 'warning' as const,
      onClick: () => setTab('paused'),
    },
    {
      key: 'draft',
      label: 'Bản nháp',
      value: stats.draft,
      sub: 'Chờ chốt lịch chạy',
      tone: 'info' as const,
      onClick: () => setTab('draft'),
    },
  ];

  const statusItems = TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: result.counts[tab.key],
  }));
  const hasViewContext = activeTab !== 'all' || Boolean(keyword);
  const allOnPageSelected = result.items.length > 0 && selected.size === result.items.length;

  return (
    <VendorLayout
      title="Voucher shop và doanh thu ưu đãi"
      breadcrumbs={['Kênh Người Bán', 'Voucher cửa hàng']}
      actions={(
        <button className="admin-primary-btn vendor-admin-primary" onClick={openCreate} disabled={working}>
          <Plus size={16} />
          Tạo voucher
        </button>
      )}
    >
      <PanelStatsGrid items={statItems} accentClassName="vendor-stat-button" />

      <div className="admin-filter-toolbar vendor-filter-toolbar">
        <PanelSearchField
          placeholder="Tìm theo tên hoặc mã voucher..."
          ariaLabel="Tìm voucher shop"
          value={searchInput}
          onChange={setSearchInput}
        />
        <PanelFilterSelect
          label="Trạng thái"
          ariaLabel="Lọc voucher theo trạng thái"
          items={statusItems}
          value={activeTab}
          onChange={(key) => setTab(key as VoucherTab)}
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
            <div>
              <h2>Danh sách voucher</h2>
            </div>
          </div>
          {loading ? (
            <AdminTableSkeleton columns={9} rows={6} />
          ) : loadError ? (
            <AdminStateBlock
              type="error"
              title="Không tải được danh sách voucher"
              description={loadError}
              actionLabel="Thử tải lại"
              onAction={() => void loadVouchers()}
            />
          ) : result.items.length === 0 ? (
            <AdminStateBlock
              type={hasViewContext ? 'search-empty' : 'empty'}
              title={hasViewContext ? 'Không có voucher phù hợp' : 'Chưa có voucher shop'}
              description={
                hasViewContext
                  ? 'Thử đổi từ khóa hoặc chuyển tab khác để xem danh sách ưu đãi.'
                  : 'Khi shop tạo voucher riêng, danh sách sẽ xuất hiện tại đây.'
              }
              actionLabel={hasViewContext ? 'Đặt lại bộ lọc' : 'Tạo voucher'}
              onAction={hasViewContext ? resetCurrentView : openCreate}
            />
          ) : (
            <>
              <div className="admin-table" role="table" aria-label="Bang voucher shop">
                <div className="admin-table-row vendor-promotions admin-table-head" role="row">
                  <div role="columnheader">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? new Set(result.items.map((item) => item.id))
                            : new Set(),
                        )
                      }
                    />
                  </div>
                  <div role="columnheader">STT</div>
                  <div role="columnheader">Voucher</div>
                  <div role="columnheader">Loại giảm</div>
                  <div role="columnheader">Giá trị</div>
                  <div role="columnheader">Điều kiện</div>
                  <div role="columnheader">Đã dùng</div>
                  <div role="columnheader">Hết hạn</div>
                  <div role="columnheader">Trạng thái</div>
                  <div role="columnheader">Hành động</div>
                </div>

                {result.items.map((voucher, index) => {
                  const usedPercent =
                    voucher.totalIssued > 0
                      ? Math.min(100, Math.round((voucher.usedCount / voucher.totalIssued) * 100))
                      : 0;

                  return (
                    <motion.div
                      key={voucher.id}
                      className="admin-table-row vendor-promotions"
                      role="row"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.16) }}
                      whileHover={{ y: -1 }}

                      onClick={() => openEdit(voucher)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div role="cell" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(voucher.id)}
                          onChange={(event) => {
                            const next = new Set(selected);
                            if (event.target.checked) {
                              next.add(voucher.id);
                            } else {
                              next.delete(voucher.id);
                            }
                            setSelected(next);
                          }}
                        />
                      </div>
                      <div role="cell" className="admin-mono">{startRow + index}</div>
                      <div role="cell">
                        <p className="admin-bold promo-name">{voucher.name}</p>
                        <p className="admin-muted promo-code">{voucher.code}</p>
                      </div>
                      <div role="cell">{voucher.discountType === 'percent' ? 'Phần trăm' : 'Giảm tiền'}</div>
                      <div role="cell" className="admin-bold">
                        {voucher.discountType === 'percent'
                          ? `${voucher.discountValue}%`
                          : formatCurrency(voucher.discountValue)}
                      </div>
                      <div role="cell">Đơn từ {formatCurrency(voucher.minOrderValue)}</div>
                      <div role="cell">
                        <p className="admin-bold">
                          {voucher.usedCount}/{voucher.totalIssued}
                        </p>
                        <div className="promo-progress-track"><span style={{ width: `${usedPercent}%` }} /></div>
                      </div>
                      <div role="cell" className="admin-muted">{voucher.endDate}</div>
                      <div role="cell">
                        <span className={`admin-pill ${toStatusClass(voucher.status)}`}>
                          {toStatusLabel(voucher.status)}
                        </span>
                      </div>
                      <div role="cell" className="admin-actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          className="admin-icon-btn subtle"
                          onClick={() => openEdit(voucher)}
                          title="Chỉnh sửa voucher"
                          disabled={working}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="admin-icon-btn subtle"
                          onClick={() => void updateVoucherStatus([voucher.id])}
                          title="Đổi trạng thái"
                          disabled={working}
                        >
                          {voucher.status === 'running' ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <button
                          className="admin-icon-btn subtle danger-icon"
                          onClick={() => requestDelete([voucher.id])}
                          title="Xóa voucher"
                          disabled={working}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <PanelTableFooter
                meta={`Hiển thị ${startRow}-${endRow} trên ${result.totalElements} voucher`}
                page={currentPage}
                totalPages={Math.max(result.totalPages, 1)}
                onPageChange={setPage}
                activePageClassName="vendor-active-page"
                nextLabel="Sau"
              />
            </>
          )}
        </div>
      </section>

      <AdminConfirmDialog
        open={Boolean(deleteState)}
        title={deleteState?.title || 'Xóa voucher'}
        description={deleteState?.description || ''}
        selectedItems={deleteState?.selectedItems}
        selectedNoun="voucher"
        confirmLabel={deleteState?.confirmLabel || 'Xóa'}
        danger
        variant="vendor"
        onCancel={() => setDeleteState(null)}
        onConfirm={() => void confirmDelete()}
      />

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} className="vendor-drawer">
        <PanelDrawerHeader
          eyebrow="Voucher shop"
          title={voucherForm.id ? 'Cập nhật voucher' : 'Tạo voucher mới'}
          onClose={() => setDrawerOpen(false)}
          closeLabel="Đóng biểu mẫu voucher"
        />
        <div className="drawer-body">
          <PanelDrawerSection title="Nhận diện ưu đãi">
            <div className="form-grid">
              <label className="form-field">
                <span>Tên voucher</span>
                <input
                  value={voucherForm.name}
                  onChange={(event) =>
                    setVoucherForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Mã giảm giá</span>
                <input
                  value={voucherForm.code}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      code: event.target.value.toUpperCase().replace(/\s+/g, ''),
                    }))
                  }
                />
              </label>
              <label className="form-field full">
                <span>Mô tả ngắn</span>
                <textarea
                  rows={3}
                  value={voucherForm.description}
                  onChange={(event) =>
                    setVoucherForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </label>
            </div>
          </PanelDrawerSection>

          <PanelDrawerSection title="Cấu hình khuyến mãi">
            <div className="form-grid">
              <label className="form-field">
                <span>Loại giảm</span>
                <select
                  value={voucherForm.discountType}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      discountType: event.target.value as VendorVoucherDiscountType,
                    }))
                  }
                >
                  <option value="percent">Giảm theo phần trăm</option>
                  <option value="fixed">Giảm số tiền cố định</option>
                </select>
              </label>
              <label className="form-field">
                <span>Giá trị giảm</span>
                <input
                  type="number"
                  min={0}
                  value={voucherForm.discountValue}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      discountValue: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Đơn tối thiểu</span>
                <input
                  type="number"
                  min={0}
                  value={voucherForm.minOrderValue}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      minOrderValue: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Tổng phát hành</span>
                <input
                  type="number"
                  min={1}
                  value={voucherForm.totalIssued}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      totalIssued: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Ngày bắt đầu</span>
                <input
                  type="date"
                  value={voucherForm.startDate}
                  onChange={(event) =>
                    setVoucherForm((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Ngày kết thúc</span>
                <input
                  type="date"
                  value={voucherForm.endDate}
                  onChange={(event) =>
                    setVoucherForm((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Trạng thái</span>
                <select
                  value={voucherForm.status}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      status: event.target.value as VendorVoucherStatus,
                    }))
                  }
                >
                  <option value="running">Đang chạy</option>
                  <option value="paused">Tạm dừng</option>
                  <option value="draft">Bản nháp</option>
                </select>
              </label>
            </div>
          </PanelDrawerSection>
        </div>
        <PanelDrawerFooter>
          <button className="admin-ghost-btn" onClick={() => setDrawerOpen(false)} disabled={working}>
            Hủy
          </button>
          <button
            className="admin-primary-btn vendor-admin-primary"
            onClick={() => void saveVoucher()}
            disabled={working}
          >
            {working ? 'Đang lưu...' : 'Lưu voucher'}
          </button>
        </PanelDrawerFooter>
      </Drawer>
    </VendorLayout>
  );
};

export default VendorPromotions;
