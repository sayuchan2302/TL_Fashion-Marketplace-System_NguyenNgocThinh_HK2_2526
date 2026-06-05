import { motion } from 'framer-motion';
import { CheckCircle2, Eye, Store } from 'lucide-react';
import { AdminStateBlock } from '../../AdminStateBlocks';
import { PanelTableFooter } from '../../../../components/Panel/PanelPrimitives';
import type { VendorWallet } from '../../../../services/walletService';
import { PAGE_SIZE, formatCurrency, toStoreRef } from './adminFinancialPresentation';

type Props = {
  isLoading: boolean;
  records: VendorWallet[];
  search: string;
  selected: Set<string>;
  page: number;
  totalPages: number;
  onSelectionChange: (next: Set<string>) => void;
  onPageChange: (page: number) => void;
  onResetCurrentView: () => void;
  onOpenDetail: (record: VendorWallet) => void;
  onOpenReleaseConfirm: (storeIds: string[]) => void;
};

const walletStatusMeta = (record: VendorWallet) => {
  if (record.reservedBalance > 0) {
    return { label: 'Chờ duyệt rút', tone: 'pending' };
  }
  if (record.availableBalance > 0) {
    return { label: 'Có thể rút', tone: 'success' };
  }
  if (record.frozenBalance > 0) {
    return { label: 'Tạm giữ tiền', tone: 'warning' };
  }
  return { label: 'Không có số dư', tone: 'neutral' };
};

const moneyClass = (value: number, tone: string) => `financial-money ${value > 0 ? tone : 'muted'}`;

const AdminFinancialWalletsPanel = ({
  isLoading,
  records,
  search,
  selected,
  page,
  totalPages,
  onSelectionChange,
  onPageChange,
  onResetCurrentView,
  onOpenDetail,
  onOpenReleaseConfirm,
}: Props) => {
  if (isLoading) {
    return (
      <AdminStateBlock
        type="empty"
        title="Đang tải dữ liệu ví"
        description="Hệ thống đang đồng bộ dữ liệu ví từ backend."
      />
    );
  }

  if (records.length === 0) {
    return (
      <AdminStateBlock
        type={search.trim() ? 'search-empty' : 'empty'}
        title={search.trim() ? 'Không tìm thấy bản ghi tài chính phù hợp' : 'Chưa có bản ghi tài chính'}
        description={
          search.trim()
            ? 'Thử đổi từ khóa hoặc đặt lại bộ lọc.'
            : 'Bản ghi tài chính sẽ xuất hiện khi có dữ liệu đơn hàng.'
        }
        actionLabel="Đặt lại bộ lọc"
        onAction={onResetCurrentView}
      />
    );
  }

  return (
    <>
      <div className="admin-table admin-responsive-table" role="table" aria-label="Bảng đối soát tài chính sàn">
        <div className="admin-table-row financials financial-wallets admin-table-head" role="row">
          <div role="columnheader">
            <input
              type="checkbox"
              checked={selected.size === records.length && records.length > 0}
              onChange={(event) =>
                onSelectionChange(
                  event.target.checked ? new Set(records.map((item) => item.storeId)) : new Set(),
                )
              }
            />
          </div>
          <div role="columnheader">STT</div>
          <div role="columnheader">Gian hàng</div>
          <div role="columnheader">Tổng số dư</div>
          <div role="columnheader">Có thể rút</div>
          <div role="columnheader">Tạm giữ</div>
          <div role="columnheader">Chờ duyệt rút</div>
          <div role="columnheader">Trạng thái</div>
          <div role="columnheader">Hành động</div>
        </div>

        {records.map((record, index) => {
          const status = walletStatusMeta(record);

          return (
            <motion.div
              key={record.id}
              className="admin-table-row financials financial-wallets"
              role="row"
              whileHover={{ y: -1 }}
            >
              <div role="cell" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(record.storeId)}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(record.storeId);
                    else next.delete(record.storeId);
                    onSelectionChange(next);
                  }}
                />
              </div>
              <div role="cell" className="admin-mono">
                {(page - 1) * PAGE_SIZE + index + 1}
              </div>
              <div role="cell" className="store-cell">
                <div className="store-avatar">
                  {record.storeLogo ? <img src={record.storeLogo} alt={record.storeName} /> : <Store size={18} />}
                </div>
                <div className="store-copy">
                  <div className="admin-bold">{record.storeName}</div>
                  <div className="admin-muted small">{record.storeSlug}</div>
                </div>
              </div>
              <div role="cell" className={moneyClass(record.totalBalance, 'total')}>
                {formatCurrency(record.totalBalance)}
              </div>
              <div role="cell" className={moneyClass(record.availableBalance, 'available')}>
                {formatCurrency(record.availableBalance)}
              </div>
              <div role="cell" className={moneyClass(record.frozenBalance, 'frozen')}>
                {formatCurrency(record.frozenBalance)}
              </div>
              <div role="cell" className={moneyClass(record.reservedBalance, 'reserved')}>
                {formatCurrency(record.reservedBalance)}
              </div>
              <div role="cell">
                <span className={`admin-pill ${status.tone}`}>{status.label}</span>
              </div>
              <div role="cell" className="financial-actions">
                <button className="admin-icon-btn subtle" title="Xem chi tiết" onClick={() => onOpenDetail(record)}>
                  <Eye size={16} />
                </button>
                {record.reservedBalance > 0 && (
                  <button
                    className="admin-icon-btn subtle success-icon"
                    title="Duyệt phiếu rút đang chờ"
                    onClick={() => onOpenReleaseConfirm([record.storeId])}
                  >
                    <CheckCircle2 size={16} />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="admin-mobile-cards" aria-label="Danh sách ví store dạng thẻ">
        {records.map((record) => {
          const status = walletStatusMeta(record);

          return (
            <article key={record.id} className="admin-mobile-card">
              <div className="admin-mobile-card-head">
                <div className="admin-mobile-card-title">
                  <div className="admin-mobile-card-title-main">
                    <p className="admin-bold">{record.storeName}</p>
                    <p className="admin-mobile-card-sub">{toStoreRef(record)}</p>
                  </div>
                </div>
                <span className={`admin-pill ${status.tone}`}>{status.label}</span>
              </div>
              <div className="admin-mobile-card-grid">
                <div className="admin-mobile-card-field">
                  <span>Tổng số dư</span>
                  <strong>{formatCurrency(record.totalBalance)}</strong>
                </div>
                <div className="admin-mobile-card-field">
                  <span>Có thể rút</span>
                  <strong>{formatCurrency(record.availableBalance)}</strong>
                </div>
                <div className="admin-mobile-card-field">
                  <span>Tạm giữ</span>
                  <strong>{formatCurrency(record.frozenBalance)}</strong>
                </div>
                <div className="admin-mobile-card-field">
                  <span>Chờ duyệt</span>
                  <strong>{formatCurrency(record.reservedBalance)}</strong>
                </div>
              </div>
              <div className="admin-mobile-card-actions">
                <button className="admin-primary-btn" type="button" onClick={() => onOpenDetail(record)}>
                  <Eye size={16} />
                  Xem chi tiết
                </button>
                {record.reservedBalance > 0 && (
                  <button
                    className="admin-icon-btn subtle success-icon"
                    type="button"
                    title="Duyệt phiếu rút đang chờ"
                    aria-label="Duyệt phiếu rút đang chờ"
                    onClick={() => onOpenReleaseConfirm([record.storeId])}
                  >
                    <CheckCircle2 size={16} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <PanelTableFooter
        meta={`Trang ${page}/${totalPages}`}
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        prevLabel="Trước"
        nextLabel="Sau"
      />
    </>
  );
};

export default AdminFinancialWalletsPanel;
