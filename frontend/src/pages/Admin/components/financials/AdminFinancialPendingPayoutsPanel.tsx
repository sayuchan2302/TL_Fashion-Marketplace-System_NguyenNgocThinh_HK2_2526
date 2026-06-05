import { motion } from 'framer-motion';
import { CheckCircle2, Eye, X } from 'lucide-react';
import { AdminStateBlock } from '../../AdminStateBlocks';
import { PanelTableFooter } from '../../../../components/Panel/PanelPrimitives';
import type { PayoutRequest } from '../../../../services/walletService';
import { PAGE_SIZE, formatCurrency, toStoreRef } from './adminFinancialPresentation';

type Props = {
  payouts: PayoutRequest[];
  payoutPage: number;
  payoutTotalPages: number;
  onPageChange: (page: number) => void;
  onOpenDetail: (payout: PayoutRequest) => void;
  onApprove: (payout: PayoutRequest) => void | Promise<void>;
  onPrepareReject: (payout: PayoutRequest) => void;
};

const AdminFinancialPendingPayoutsPanel = ({
  payouts,
  payoutPage,
  payoutTotalPages,
  onPageChange,
  onOpenDetail,
  onApprove,
  onPrepareReject,
}: Props) => {
  if (payouts.length === 0) {
    return (
      <AdminStateBlock
        type="empty"
        title="Không có yêu cầu rút tiền chờ duyệt"
        description="Tất cả yêu cầu đã được xử lý hoặc chưa có yêu cầu mới."
      />
    );
  }

  return (
    <>
      <div className="admin-table admin-responsive-table" role="table" aria-label="Bảng yêu cầu rút tiền">
        <div className="admin-table-row financials financial-payouts admin-table-head" role="row">
          <div role="columnheader">STT</div>
          <div role="columnheader">Store</div>
          <div role="columnheader">Số tiền</div>
          <div role="columnheader">Ngân hàng</div>
          <div role="columnheader">STK</div>
          <div role="columnheader">Ngày yêu cầu</div>
          <div role="columnheader">Hành động</div>
        </div>

        {payouts.map((payout, index) => (
          <motion.div
            key={payout.id}
            className="admin-table-row financials financial-payouts"
            role="row"
            whileHover={{ y: -1 }}
          >
            <div role="cell" className="admin-mono">
              {(payoutPage - 1) * PAGE_SIZE + index + 1}
            </div>
            <div role="cell">
              <div className="admin-bold">{payout.storeName}</div>
              <small className="admin-muted">{toStoreRef({ storeSlug: payout.storeSlug })}</small>
            </div>
            <div role="cell" className="admin-bold">
              {formatCurrency(payout.amount)}
            </div>
            <div role="cell">{payout.bankName}</div>
            <div role="cell" className="admin-muted">{payout.bankAccountNumber}</div>
            <div role="cell" className="admin-muted">
              {new Date(payout.createdAt).toLocaleString('vi-VN')}
            </div>
            <div role="cell" className="financial-actions">
              <button className="admin-icon-btn subtle" title="Xem chi tiết" onClick={() => onOpenDetail(payout)}>
                <Eye size={16} />
              </button>
              <button className="admin-icon-btn subtle success-icon" title="Duyệt" onClick={() => void onApprove(payout)}>
                <CheckCircle2 size={16} />
              </button>
              <button
                className="admin-icon-btn subtle danger-icon"
                title="Từ chối"
                onClick={() => onPrepareReject(payout)}
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="admin-mobile-cards" aria-label="Danh sách phiếu rút tiền dạng thẻ">
        {payouts.map((payout) => (
          <article key={payout.id} className="admin-mobile-card">
            <div className="admin-mobile-card-head">
              <div className="admin-mobile-card-title">
                <div className="admin-mobile-card-title-main">
                  <p className="admin-bold">{payout.storeName}</p>
                  <p className="admin-mobile-card-sub">{toStoreRef({ storeSlug: payout.storeSlug })}</p>
                </div>
              </div>
              <span className="admin-pill pending">Chờ duyệt</span>
            </div>
            <div className="admin-mobile-card-grid">
              <div className="admin-mobile-card-field">
                <span>Số tiền</span>
                <strong>{formatCurrency(payout.amount)}</strong>
              </div>
              <div className="admin-mobile-card-field">
                <span>Ngân hàng</span>
                <strong>{payout.bankName}</strong>
              </div>
              <div className="admin-mobile-card-field">
                <span>STK</span>
                <strong>{payout.bankAccountNumber}</strong>
              </div>
              <div className="admin-mobile-card-field">
                <span>Ngày yêu cầu</span>
                <strong>{new Date(payout.createdAt).toLocaleString('vi-VN')}</strong>
              </div>
            </div>
            <div className="admin-mobile-card-actions">
              <button className="admin-primary-btn" type="button" onClick={() => onOpenDetail(payout)}>
                <Eye size={16} />
                Xem chi tiết
              </button>
              <button className="admin-icon-btn subtle success-icon" type="button" title="Duyệt" aria-label="Duyệt phiếu rút" onClick={() => void onApprove(payout)}>
                <CheckCircle2 size={16} />
              </button>
              <button
                className="admin-icon-btn subtle danger-icon"
                type="button"
                title="Từ chối"
                aria-label="Từ chối phiếu rút"
                onClick={() => onPrepareReject(payout)}
              >
                <X size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>

      <PanelTableFooter
        meta={`Trang ${payoutPage}/${payoutTotalPages}`}
        page={payoutPage}
        totalPages={payoutTotalPages}
        onPageChange={onPageChange}
        prevLabel="Trước"
        nextLabel="Sau"
      />
    </>
  );
};

export default AdminFinancialPendingPayoutsPanel;
