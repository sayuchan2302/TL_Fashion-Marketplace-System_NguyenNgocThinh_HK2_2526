import './AdminFinancials.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from './AdminLayout';
import AdminConfirmDialog from './AdminConfirmDialog';
import { PanelFilterSelect, PanelSearchField, PanelStatsGrid } from '../../components/Panel/PanelPrimitives';
import { useToast } from '../../contexts/ToastContext';
import { walletService, type VendorWallet, type PayoutRequest } from '../../services/walletService';
import { adminDashboardService } from '../../services/adminDashboardService';
import {
  adminFinancialSettingsService,
  type CommissionSettings,
} from '../../services/adminFinancialSettingsService';
import AdminFinancialWalletsPanel from './components/financials/AdminFinancialWalletsPanel';
import AdminFinancialPendingPayoutsPanel from './components/financials/AdminFinancialPendingPayoutsPanel';
import AdminWalletDetailDrawer from './components/financials/AdminWalletDetailDrawer';
import AdminPayoutDetailDrawer from './components/financials/AdminPayoutDetailDrawer';
import { PAGE_SIZE, formatCurrency } from './components/financials/adminFinancialPresentation';
import type { AdminTab, ConfirmState, FinancialSnapshot } from './components/financials/adminFinancialTypes';
import { ADMIN_VIEW_KEYS } from './adminListView';
import { useAdminViewState } from './useAdminViewState';

type PayoutConfirmState = {
  mode: 'approve' | 'reject';
  payout: PayoutRequest;
};

const AdminFinancials = () => {
  const { addToast } = useToast();
  const [wallets, setWallets] = useState<VendorWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailRecord, setDetailRecord] = useState<VendorWallet | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [financialSnapshot, setFinancialSnapshot] = useState<FinancialSnapshot>({
    gmv: 0,
    commission: 0,
    review: 0,
    pendingPayoutTotal: 0,
    pendingPayoutCount: 0,
  });
  const [pendingPayouts, setPendingPayouts] = useState<PayoutRequest[]>([]);
  const [payoutTotalPages, setPayoutTotalPages] = useState(1);
  const [selectedPayout, setSelectedPayout] = useState<PayoutRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [isApplyingPayout, setIsApplyingPayout] = useState(false);
  const [payoutConfirm, setPayoutConfirm] = useState<PayoutConfirmState | null>(null);
  const [commissionSettings, setCommissionSettings] = useState<CommissionSettings | null>(null);
  const [commissionRateInput, setCommissionRateInput] = useState('5');
  const [isSavingCommissionSettings, setIsSavingCommissionSettings] = useState(false);
  const view = useAdminViewState({
    storageKey: ADMIN_VIEW_KEYS.financials,
    path: '/admin/financials',
    validStatusKeys: ['wallets', 'payouts'],
    defaultStatus: 'wallets',
  });
  const activeTab = (view.status === 'payouts' ? 'payouts' : 'wallets') as AdminTab;
  const search = view.search;
  const page = view.page;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [walletPage, dashboard, payoutSummary, nextCommissionSettings] = await Promise.all([
        walletService.getAdminWallets(search.trim(), page, PAGE_SIZE),
        adminDashboardService.get(),
        walletService.getPayoutSummary(),
        adminFinancialSettingsService.getCommissionSettings(),
      ]);

      setWallets(walletPage.content || []);
      setTotalPages(Math.max(Number(walletPage.totalPages || 1), 1));
      setFinancialSnapshot({
        gmv: Number(dashboard.metrics.gmvDelivered || 0),
        commission: Number(dashboard.metrics.commissionDelivered || 0),
        review: Number(dashboard.quickViews.parentOrdersNeedAttention || 0),
        pendingPayoutTotal: Number(payoutSummary.pendingTotal || 0),
        pendingPayoutCount: Number(payoutSummary.pendingCount || 0),
      });
      setCommissionSettings(nextCommissionSettings);
      setCommissionRateInput(String(nextCommissionSettings.defaultCommissionRate));
    } catch {
      setWallets([]);
      setTotalPages(1);
      setFinancialSnapshot({
        gmv: 0,
        commission: 0,
        review: 0,
        pendingPayoutTotal: 0,
        pendingPayoutCount: 0,
      });
      setCommissionSettings(null);
      addToast('Lỗi khi tải dữ liệu đối soát.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast, page, search]);

  const fetchPendingPayouts = useCallback(async () => {
    try {
      const result = await walletService.getPendingPayouts(page, PAGE_SIZE);
      setPendingPayouts(result.content || []);
      setPayoutTotalPages(Math.max(Number(result.totalPages || 1), 1));
    } catch {
      setPendingPayouts([]);
    }
  }, [page]);

  const fetchAllPendingPayouts = useCallback(async () => {
    const allPending: PayoutRequest[] = [];
    let currentPage = 1;
    let total = 1;

    do {
      const result = await walletService.getPendingPayouts(currentPage, PAGE_SIZE);
      allPending.push(...(result.content || []));
      total = Math.max(Number(result.totalPages || 1), 1);
      currentPage += 1;
    } while (currentPage <= total);

    return allPending;
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === 'payouts') {
      void fetchPendingPayouts();
    }
  }, [activeTab, fetchPendingPayouts]);

  const records = useMemo(() => wallets, [wallets]);

  const totals = useMemo(
    () => ({
      gmv: financialSnapshot.gmv,
      commission: financialSnapshot.commission,
      payout: records.reduce((sum, record) => sum + record.availableBalance, 0),
      review: financialSnapshot.review,
      pendingPayoutTotal: financialSnapshot.pendingPayoutTotal,
      pendingPayoutCount: financialSnapshot.pendingPayoutCount,
    }),
    [financialSnapshot, records],
  );

  const resetCurrentView = () => {
    setSelected(new Set());
    setDetailRecord(null);
    setSelectedPayout(null);
    setRejectNote('');
    view.resetCurrentView();
  };

  const changeTab = (key: string) => {
    setSelected(new Set());
    setDetailRecord(null);
    setSelectedPayout(null);
    setRejectNote('');
    view.setStatus(key);
  };

  const changeSearch = (value: string) => {
    setSelected(new Set());
    view.setSearch(value);
  };

  const openReleaseConfirm = (storeIds: string[]) => {
    const items = records.filter((record) => storeIds.includes(record.storeId) && record.reservedBalance > 0);
    if (items.length === 0) {
      addToast('Không có shop nào có phiếu rút tiền đang chờ duyệt.', 'info');
      return;
    }

    setConfirmState({
      storeIds: items.map((item) => item.storeId),
      storeNames: items.map((item) => item.storeName),
    });
  };

  const applyPayout = async () => {
    if (!confirmState || isApplyingPayout) return;

    const storeIds = new Set(confirmState.storeIds);

    try {
      setIsApplyingPayout(true);
      const allPending = await fetchAllPendingPayouts();
      const targetRequests = allPending.filter(
        (request) => request.status === 'PENDING' && storeIds.has(request.storeId),
      );

      if (targetRequests.length === 0) {
        addToast('Không tìm thấy phiếu rút tiền chờ duyệt cho các shop đã chọn.', 'info');
        setSelected(new Set());
        setConfirmState(null);
        return;
      }

      const approvalResults = await Promise.allSettled(
        targetRequests.map((request) => walletService.approvePayoutRequest(request.id)),
      );

      const approvedCount = approvalResults.filter((result) => result.status === 'fulfilled').length;
      const failedCount = approvalResults.length - approvedCount;

      if (approvedCount > 0) {
        addToast(`Đã duyệt ${approvedCount} phiếu rút tiền.`, 'success');
      }
      if (failedCount > 0) {
        addToast(`Có ${failedCount} yêu cầu duyệt thất bại. Vui lòng thử lại.`, 'error');
      }

      setSelected(new Set());
      setConfirmState(null);
      await Promise.all([fetchData(), fetchPendingPayouts()]);
    } catch {
      addToast('Lỗi trong quá trình duyệt phiếu rút tiền.', 'error');
    } finally {
      setIsApplyingPayout(false);
    }
  };

  const handleApprovePayout = async (payout: PayoutRequest) => {
    try {
      await walletService.approvePayoutRequest(payout.id);
      addToast(`Đã duyệt yêu cầu rút tiền cho ${payout.storeName}.`, 'success');
      await fetchPendingPayouts();
      await fetchData();
    } catch {
      addToast('Không thể duyệt yêu cầu rút tiền.', 'error');
    }
  };

  const handleRejectPayout = async (payout: PayoutRequest) => {
    if (!rejectNote.trim()) {
      addToast('Vui lòng nhập lý do từ chối.', 'error');
      return;
    }

    try {
      await walletService.rejectPayout(payout.id, rejectNote.trim());
      addToast(`Đã từ chối yêu cầu rút tiền cho ${payout.storeName}.`, 'info');
      setSelectedPayout(null);
      setRejectNote('');
      await fetchPendingPayouts();
      await fetchData();
    } catch {
      addToast('Không thể từ chối yêu cầu rút tiền.', 'error');
    }
  };

  const requestApprovePayout = (payout: PayoutRequest) => {
    setPayoutConfirm({ mode: 'approve', payout });
  };

  const requestRejectPayout = (payout: PayoutRequest) => {
    if (!rejectNote.trim()) {
      addToast('Vui lòng nhập lý do từ chối.', 'error');
      return;
    }
    setPayoutConfirm({ mode: 'reject', payout });
  };

  const saveCommissionSettings = async () => {
    const nextRate = Number.parseFloat(commissionRateInput);
    if (!Number.isFinite(nextRate) || nextRate <= 0 || nextRate > 100) {
      addToast('Tỷ lệ hoa hồng mặc định phải lớn hơn 0 và không vượt quá 100%.', 'error');
      return;
    }

    try {
      setIsSavingCommissionSettings(true);
      const nextSettings = await adminFinancialSettingsService.updateCommissionSettings(nextRate);
      setCommissionSettings(nextSettings);
      setCommissionRateInput(String(nextSettings.defaultCommissionRate));
      addToast('Đã cập nhật phí hoa hồng mặc định toàn sàn.', 'success');
    } catch {
      addToast('Không thể cập nhật phí hoa hồng mặc định.', 'error');
    } finally {
      setIsSavingCommissionSettings(false);
    }
  };

  const confirmSinglePayoutAction = async () => {
    if (!payoutConfirm || isApplyingPayout) return;

    try {
      setIsApplyingPayout(true);
      if (payoutConfirm.mode === 'approve') {
        await handleApprovePayout(payoutConfirm.payout);
      } else {
        await handleRejectPayout(payoutConfirm.payout);
      }
      setPayoutConfirm(null);
    } finally {
      setIsApplyingPayout(false);
    }
  };

  return (
    <AdminLayout title="Tài chính sàn" breadcrumbs={['Tài chính sàn', 'Duyệt phiếu rút tiền']}>
      <PanelStatsGrid
        items={[
          {
            key: 'gmv',
            label: 'GMV toàn sàn',
            value: formatCurrency(totals.gmv),
            sub: 'Tổng giá trị đơn hàng từ bảng vận hành hiện tại',
          },
          {
            key: 'commission',
            label: 'Commission thực thu',
            value: formatCurrency(totals.commission),
            sub: 'Tổng phí sàn từ các đơn đã hoàn tất',
            tone: 'info',
          },
          {
            key: 'payout',
            label: 'Số dư khả dụng',
            value: formatCurrency(totals.payout),
            sub: 'Tổng số tiền shop có thể tạo phiếu rút',
            tone: 'success',
          },
          {
            key: 'pending',
            label: 'Phiếu rút chờ duyệt',
            value: totals.pendingPayoutCount,
            sub: formatCurrency(totals.pendingPayoutTotal),
            tone: totals.pendingPayoutCount > 0 ? 'warning' : '',
          },
        ]}
      />

      <section className="admin-panels single financial-commission-policy">
        <div className="admin-panel financial-commission-card">
          <div className="admin-panel-head financial-commission-head">
            <div>
              <h2>Chính sách hoa hồng</h2>
              <p className="admin-muted">
                Mức mặc định áp dụng cho seller đang dùng chính sách chung. Seller override riêng vẫn giữ tỷ lệ đã cấu hình tại quản lý gian hàng.
              </p>
            </div>
          </div>
          <div className="financial-commission-layout">
            <label className="financial-commission-input">
              <span>Phí hoa hồng mặc định toàn sàn</span>
              <div className="financial-commission-field">
                <input
                  className="admin-input"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={commissionRateInput}
                  onChange={(event) => setCommissionRateInput(event.target.value)}
                  aria-label="Phí hoa hồng mặc định toàn sàn"
                />
                <strong>%</strong>
              </div>
            </label>
            <div className="financial-commission-stats" aria-label="Thống kê áp dụng phí hoa hồng">
              <div>
                <span className="admin-muted small">Dùng mặc định</span>
                <strong>{commissionSettings?.sellersUsingDefault ?? 0}</strong>
              </div>
              <div>
                <span className="admin-muted small">Override riêng</span>
                <strong>{commissionSettings?.sellersUsingOverride ?? 0}</strong>
              </div>
              <div>
                <span className="admin-muted small">Đang áp dụng</span>
                <strong>{commissionSettings ? `${commissionSettings.defaultCommissionRate}%` : '--'}</strong>
              </div>
            </div>
            <button
              type="button"
              className="admin-primary-btn financial-commission-save"
              onClick={() => void saveCommissionSettings()}
              disabled={isSavingCommissionSettings || !commissionRateInput.trim()}
            >
              {isSavingCommissionSettings ? 'Đang lưu...' : 'Lưu chính sách'}
            </button>
          </div>
        </div>
      </section>

      <section className="admin-panels single">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>{activeTab === 'wallets' ? 'Ví shop và số dư rút tiền' : 'Danh sách phiếu rút tiền chờ duyệt'}</h2>
          </div>
          <div className="admin-filter-toolbar">
            {activeTab === 'wallets' ? (
              <PanelSearchField
                placeholder="Tìm gian hàng hoặc mã ví"
                ariaLabel="Tìm ví store"
                value={search}
                onChange={changeSearch}
              />
            ) : (
              <span className="admin-filter-toolbar-spacer" aria-hidden="true" />
            )}
            <PanelFilterSelect
              label="Chế độ"
              ariaLabel="Chọn chế độ tài chính"
              items={[
                { key: 'wallets', label: 'Ví store', count: records.length },
                { key: 'payouts', label: 'Chờ duyệt rút tiền', count: totals.pendingPayoutCount },
              ]}
              value={activeTab}
              onChange={changeTab}
            />
            {view.hasViewContext ? (
              <button type="button" className="admin-filter-reset" onClick={resetCurrentView}>
                Đặt lại
              </button>
            ) : null}
          </div>

          {activeTab === 'wallets' ? (
            <AdminFinancialWalletsPanel
              isLoading={isLoading}
              records={records}
              search={search}
              selected={selected}
              page={page}
              totalPages={totalPages}
              onSelectionChange={setSelected}
              onPageChange={view.setPage}
              onResetCurrentView={resetCurrentView}
              onOpenDetail={setDetailRecord}
              onOpenReleaseConfirm={openReleaseConfirm}
            />
          ) : (
            <AdminFinancialPendingPayoutsPanel
              payouts={pendingPayouts}
              payoutPage={page}
              payoutTotalPages={payoutTotalPages}
              onPageChange={view.setPage}
              onOpenDetail={setSelectedPayout}
              onApprove={(payout) => {
                requestApprovePayout(payout);
              }}
              onPrepareReject={(payout) => {
                setSelectedPayout(payout);
                setRejectNote('');
              }}
            />
          )}
        </div>
      </section>

      <AdminConfirmDialog
        open={Boolean(confirmState)}
        title="Xác nhận duyệt phiếu rút tiền"
        description="Các phiếu rút tiền đang chờ của shop sẽ được chuyển sang trạng thái đã duyệt và số dư reserved sẽ bị trừ."
        selectedItems={confirmState?.storeNames}
        selectedNoun="bản ghi tài chính"
        confirmLabel={isApplyingPayout ? 'Đang duyệt...' : 'Xác nhận duyệt phiếu'}
        confirmDisabled={isApplyingPayout}
        cancelDisabled={isApplyingPayout}
        onCancel={() => {
          if (isApplyingPayout) return;
          setConfirmState(null);
        }}
        onConfirm={() => void applyPayout()}
      />

      <AdminConfirmDialog
        open={Boolean(payoutConfirm)}
        title={payoutConfirm?.mode === 'approve' ? 'Duyệt phiếu rút tiền' : 'Từ chối phiếu rút tiền'}
        description={
          payoutConfirm?.mode === 'approve'
            ? 'Phiếu rút tiền sẽ được chuyển sang trạng thái đã duyệt và cập nhật số dư ví store.'
            : 'Phiếu rút tiền sẽ bị từ chối với lý do đã nhập trong hồ sơ chi tiết.'
        }
        selectedItems={payoutConfirm ? [payoutConfirm.payout.storeName] : undefined}
        selectedNoun="phiếu rút"
        confirmLabel={isApplyingPayout ? 'Đang xử lý...' : payoutConfirm?.mode === 'approve' ? 'Duyệt phiếu' : 'Từ chối phiếu'}
        danger={payoutConfirm?.mode === 'reject'}
        confirmDisabled={isApplyingPayout || (payoutConfirm?.mode === 'reject' && !rejectNote.trim())}
        cancelDisabled={isApplyingPayout}
        onCancel={() => {
          if (isApplyingPayout) return;
          setPayoutConfirm(null);
        }}
        onConfirm={() => void confirmSinglePayoutAction()}
      />

      <AdminWalletDetailDrawer
        record={detailRecord}
        onClose={() => setDetailRecord(null)}
        onOpenReleaseConfirm={openReleaseConfirm}
      />

      <AdminPayoutDetailDrawer
        payout={selectedPayout}
        rejectNote={rejectNote}
        onRejectNoteChange={setRejectNote}
        onClose={() => {
          setSelectedPayout(null);
          setRejectNote('');
        }}
        onReject={(payout) => {
          requestRejectPayout(payout);
        }}
        onApprove={(payout) => {
          requestApprovePayout(payout);
        }}
      />
    </AdminLayout>
  );
};

export default AdminFinancials;
