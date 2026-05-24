import { ArrowUpRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import Drawer from '../../../../components/Drawer/Drawer';
import type { VendorWallet } from '../../../../services/walletService';
import { formatCurrency } from './adminFinancialPresentation';
import {
  PanelDrawerHeader,
  PanelDrawerSection,
  PanelDrawerFooter,
} from '../../../../components/Panel/PanelPrimitives';

type Props = {
  record: VendorWallet | null;
  onClose: () => void;
  onOpenReleaseConfirm: (storeIds: string[]) => void;
};

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const first = parts[0]?.charAt(0) || '';
  const last = parts[parts.length - 1]?.charAt(0) || '';
  return `${first}${last}`.toUpperCase();
};

const AdminWalletDetailDrawer = ({ record, onClose, onOpenReleaseConfirm }: Props) => (
  <Drawer open={Boolean(record)} onClose={onClose} className="financial-drawer" size="lg" ariaLabel="Chi tiết ví shop">
    {record ? (
      <>
        <PanelDrawerHeader onClose={onClose} eyebrow="Ví shop" title={record.storeName} />

        <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          <PanelDrawerSection title="Thông tin gian hàng">
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
                {record.storeLogo ? (
                  <img
                    src={record.storeLogo}
                    alt={record.storeName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  />
                ) : (
                  getInitials(record.storeName)
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="admin-bold" style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  {record.storeName}
                </div>
                {record.storeSlug && (
                  <div className="admin-muted" style={{ fontSize: '13px', color: '#64748b' }}>
                    @{record.storeSlug}
                  </div>
                )}
              </div>
              <Link
                to={`/admin/stores?search=${record.storeId}`}
                className="admin-ghost-btn"
                style={{ gap: 4, padding: '8px 12px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                Xem gian hàng
              </Link>
            </div>
          </PanelDrawerSection>

          <PanelDrawerSection title="Trạng thái ví">
            <div
              className="reviews-drawer-hero"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                background: '#ffffff',
              }}
            >
              <span
                className={`admin-pill ${record.reservedBalance > 0 ? 'pending' : record.availableBalance > 0 ? 'success' : 'neutral'
                  }`}
                style={{ fontSize: 13, padding: '6px 12px', fontWeight: 700 }}
              >
                {record.reservedBalance > 0
                  ? 'Chờ duyệt rút'
                  : record.availableBalance > 0
                    ? 'Có thể rút'
                    : 'Trống'}
              </span>
              {record.reservedBalance > 0 && (
                <div className="admin-muted" style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                  {formatCurrency(record.reservedBalance)} đang chờ duyệt rút
                </div>
              )}
            </div>
          </PanelDrawerSection>

          <PanelDrawerSection title="Số dư ví">
            <div className="financial-signal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#0d9488', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Khả dụng
                </span>
                <strong className="returns-meta-value" style={{ fontSize: '18px', color: '#0d9488', fontWeight: 800 }}>
                  {formatCurrency(record.availableBalance)}
                </strong>
              </div>
              <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Đóng băng
                </span>
                <strong className="returns-meta-value" style={{ fontSize: '18px', color: '#d97706', fontWeight: 800 }}>
                  {formatCurrency(record.frozenBalance)}
                </strong>
              </div>
              <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Chờ duyệt rút
                </span>
                <strong className="returns-meta-value" style={{ fontSize: '18px', color: '#0f766e', fontWeight: 800 }}>
                  {formatCurrency(record.reservedBalance)}
                </strong>
              </div>
              <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Tổng
                </span>
                <strong className="returns-meta-value" style={{ fontSize: '18px', color: '#0f172a', fontWeight: 800 }}>
                  {formatCurrency(record.totalBalance)}
                </strong>
              </div>
            </div>
          </PanelDrawerSection>

          <PanelDrawerSection title="Thông tin cập nhật">
            <div className="financial-signal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
              <div className="returns-meta-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="returns-meta-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Cập nhật lần cuối
                </span>
                <strong className="returns-meta-value" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                  {new Date(record.lastUpdated).toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </strong>
              </div>
            </div>
          </PanelDrawerSection>
        </div>

        <PanelDrawerFooter>
          <button className="admin-ghost-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
            Đóng
          </button>
          {record.reservedBalance > 0 && (
            <button className="admin-primary-btn" onClick={() => onOpenReleaseConfirm([record.storeId])}>
              <ArrowUpRight size={14} />
              Duyệt phiếu rút
            </button>
          )}
        </PanelDrawerFooter>
      </>
    ) : null}
  </Drawer>
);

export default AdminWalletDetailDrawer;
