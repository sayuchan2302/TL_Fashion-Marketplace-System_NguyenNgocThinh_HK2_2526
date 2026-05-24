import { Banknote, Building2, CheckCircle2, Clock, User, X } from 'lucide-react';
import Drawer from '../../../../components/Drawer/Drawer';
import type { PayoutRequest } from '../../../../services/walletService';
import { formatCurrency } from './adminFinancialPresentation';
import {
  PanelDrawerHeader,
  PanelDrawerSection,
  PanelDrawerFooter,
} from '../../../../components/Panel/PanelPrimitives';

type Props = {
  payout: PayoutRequest | null;
  rejectNote: string;
  onRejectNoteChange: (note: string) => void;
  onClose: () => void;
  onReject: (payout: PayoutRequest) => void | Promise<void>;
  onApprove: (payout: PayoutRequest) => void | Promise<void>;
};

const getStatusBadge = (status: string) => {
  const statusMap: Record<string, { label: string; className: string }> = {
    PENDING: { label: 'Chờ duyệt', className: 'pending' },
    APPROVED: { label: 'Đã duyệt', className: 'success' },
    REJECTED: { label: 'Đã từ chối', className: 'danger' },
    COMPLETED: { label: 'Hoàn thành', className: 'success' },
  };
  return statusMap[status] || { label: status, className: 'neutral' };
};

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const first = parts[0]?.charAt(0) || '';
  const last = parts[parts.length - 1]?.charAt(0) || '';
  return `${first}${last}`.toUpperCase();
};

const AdminPayoutDetailDrawer = ({
  payout,
  rejectNote,
  onRejectNoteChange,
  onClose,
  onReject,
  onApprove,
}: Props) => (
  <Drawer
    open={Boolean(payout)}
    onClose={onClose}
    className="financial-drawer"
    size="lg"
    ariaLabel="Chi tiết yêu cầu rút tiền"
  >
    {payout ? (
      <>
        <PanelDrawerHeader onClose={onClose} eyebrow="Chi tiết yêu cầu rút tiền" title={payout.storeName} />

        <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          <PanelDrawerSection title="Số tiền & Trạng thái">
            <div
              className="reviews-drawer-hero"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
              }}
            >
              <div
                className="returns-customer-avatar large"
              >
                {payout.storeLogo ? (
                  <img
                    src={payout.storeLogo}
                    alt={payout.storeName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  />
                ) : (
                  getInitials(payout.storeName)
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="admin-bold" style={{ fontSize: '24px', color: '#0d9488', fontWeight: 800 }}>
                  {formatCurrency(payout.amount)}
                </div>
                <div className="admin-muted" style={{ fontSize: '12px', color: '#64748b' }}>
                  Yêu cầu ngày {new Date(payout.createdAt).toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
              <span className={`admin-pill ${getStatusBadge(payout.status).className}`} style={{ fontSize: 13, padding: '6px 12px', fontWeight: 700 }}>
                {getStatusBadge(payout.status).label}
              </span>
            </div>
          </PanelDrawerSection>

          <PanelDrawerSection title="Thông tin ngân hàng">
            <div className="financial-signal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={13} style={{ color: '#64748b' }} /> Ngân hàng
                </span>
                <strong className="returns-meta-value" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                  {payout.bankName}
                </strong>
              </div>
              <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Banknote size={13} style={{ color: '#64748b' }} /> Số tài khoản
                </span>
                <strong className="returns-meta-value returns-code" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                  {payout.bankAccountNumber}
                </strong>
              </div>
              <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
                <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={13} style={{ color: '#64748b' }} /> Chủ tài khoản
                </span>
                <strong className="returns-meta-value" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                  {payout.bankAccountName}
                </strong>
              </div>
            </div>
          </PanelDrawerSection>

          {payout.status !== 'PENDING' && (
            <PanelDrawerSection title="Thông tin xử lý">
              <div className="financial-signal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                {payout.processedBy && (
                  <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={13} style={{ color: '#64748b' }} /> Người xử lý
                    </span>
                    <strong className="returns-meta-value" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                      {payout.processedBy}
                    </strong>
                  </div>
                )}
                {payout.processedAt && (
                  <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={13} style={{ color: '#64748b' }} /> Thời gian xử lý
                    </span>
                    <strong className="returns-meta-value" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                      {new Date(payout.processedAt).toLocaleString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </strong>
                  </div>
                )}
                {payout.adminNote && (
                  <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#fffbeb', borderColor: '#fef3c7', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
                    <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Ghi chú phản hồi
                    </span>
                    <strong className="returns-meta-value" style={{ fontSize: '13px', color: '#78350f', fontWeight: 500, lineHeight: 1.5 }}>
                      {payout.adminNote}
                    </strong>
                  </div>
                )}
              </div>
            </PanelDrawerSection>
          )}

          {payout.status === 'PENDING' && (
            <PanelDrawerSection title="Lý do từ chối (nếu có)">
              <textarea
                className="admin-textarea"
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  outline: 'none',
                  resize: 'vertical',
                }}
                placeholder="Nhập lý do từ chối yêu cầu rút tiền..."
                value={rejectNote}
                onChange={(event) => onRejectNoteChange(event.target.value)}
              />
            </PanelDrawerSection>
          )}
        </div>

        <PanelDrawerFooter>
          <button className="admin-ghost-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
            Đóng
          </button>
          {payout.status === 'PENDING' && (
            <>
              <button className="admin-ghost-btn danger" onClick={() => void onReject(payout)}>
                <X size={14} /> Từ chối
              </button>
              <button className="admin-primary-btn" onClick={() => void onApprove(payout)}>
                <CheckCircle2 size={14} /> Duyệt rút tiền
              </button>
            </>
          )}
        </PanelDrawerFooter>
      </>
    ) : null}
  </Drawer>
);

export default AdminPayoutDetailDrawer;
