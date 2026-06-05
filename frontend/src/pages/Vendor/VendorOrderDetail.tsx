import './Vendor.css';
import '../../styles/orderDetailTheme.css';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Copy, MapPin, Package, Percent, Printer, Store, Truck, User, XCircle } from 'lucide-react';
import { startTransition, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { VendorOrderPrintTemplate } from './components/orders/VendorOrderPrintTemplate';
import './components/orders/VendorPrintStyle.css';
import VendorLayout from './VendorLayout';
import { formatVendorOrderDate, getVendorOrderStatusLabel, getVendorOrderStatusTone } from './vendorOrderPresentation';
import { formatCurrency } from '../../services/commissionService';
import { vendorPortalService, type VendorOrderDetailData } from '../../services/vendorPortalService';
import { useToast } from '../../contexts/ToastContext';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { AdminStateBlock } from '../Admin/AdminStateBlocks';
import { copyTextToClipboard } from './vendorHelpers';
import { toDisplayOrderCode } from '../../utils/displayCode';
import { getOptimizedImageUrl } from '../../utils/getOptimizedImageUrl';
import { usePageTitle } from '../../hooks/usePageTitle';

const emptyOrder: VendorOrderDetailData = {
  id: '',
  code: '',
  status: 'pending',
  createdAt: new Date().toISOString(),
  customer: { name: '', email: '', phone: '' },
  shippingAddress: { fullName: '', phone: '', address: '', ward: '', district: '', city: '' },
  items: [],
  subtotal: 0,
  shippingFee: 0,
  discount: 0,
  total: 0,
  paymentMethod: 'COD',
  paymentStatus: 'pending',
  note: '',
  trackingNumber: '',
  carrier: '',
  commissionFee: 0,
  vendorPayout: 0,
  timeline: [],
};

const VendorOrderDetail = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [order, setOrder] = useState<VendorOrderDetailData>(emptyOrder);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const pageOrderCode = order.code || id || '';
  usePageTitle(
    pageOrderCode
      ? `Kênh người bán - Đơn hàng #${toDisplayOrderCode(pageOrderCode)}`
      : 'Kênh người bán - Chi tiết đơn hàng',
  );

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        setLoadError('');
        const next = await vendorPortalService.getOrderDetail(id);
        if (!active) return;
        startTransition(() => setOrder(next));
      } catch (err: unknown) {
        if (!active) return;
        const message = getUiErrorMessage(err, 'Không tải được chi tiết đơn hàng');
        setLoadError(message);
        setOrder(emptyOrder);
        addToast(message, 'error');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [addToast, id, reloadKey]);

  const updateStatus = async (
    status: 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
    nextUiStatus: VendorOrderDetailData['status'],
    message: string,
    payload?: { trackingNumber?: string; carrier?: string; reason?: string },
  ) => {
    setIsProcessing(true);
    try {
      await vendorPortalService.updateOrderStatus(order.id || id, status, payload);
      setOrder((current) => ({
        ...current,
        status: nextUiStatus,
        trackingNumber: payload?.trackingNumber || current.trackingNumber,
        carrier: payload?.carrier || current.carrier,
      }));
      addToast(message, 'success');
    } catch (err: unknown) {
      addToast(getUiErrorMessage(err, 'Không thể cập nhật trạng thái đơn hàng'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyOrderId = async () => {
    const copied = await copyTextToClipboard(toDisplayOrderCode(order.code));
    addToast(copied ? 'Đã sao chép mã đơn hàng' : 'Không thể sao chép mã đơn hàng', copied ? 'success' : 'error');
  };

  const handleCopyTracking = async () => {
    const copied = await copyTextToClipboard(order.trackingNumber);
    addToast(copied ? 'Đã sao chép mã vận đơn' : 'Không thể sao chép mã vận đơn', copied ? 'success' : 'error');
  };

  const shipOrder = async () => {
    const tracking = window.prompt('Nhập mã vận đơn');
    if (!tracking || !tracking.trim()) {
      addToast('Cần nhập mã vận đơn trước khi bàn giao', 'error');
      return;
    }

    const carrier = window.prompt('Nhập đơn vị vận chuyển');
    if (!carrier || !carrier.trim()) {
      addToast('Cần nhập đơn vị vận chuyển trước khi bàn giao', 'error');
      return;
    }

    await updateStatus(
      'SHIPPED',
      'shipped',
      'Đơn hàng đã bàn giao cho đơn vị vận chuyển',
      { trackingNumber: tracking.trim(), carrier: carrier.trim() },
    );
  };


  const handlePrintDeliveryNote = () => {
    // 1. Kích hoạt in trên trình duyệt
    window.print();

    // 2. Ghi nhận nhật ký sự kiện vào mảng timeline của đơn hàng hiện tại
    setOrder((current) => {
      const alreadyPrinted = current.timeline.some(
        (log) => log.status === 'printed' || (log.note && log.note.includes('in phiếu giao'))
      );
      if (alreadyPrinted) return current;

      const newTimelineItem = {
        status: 'printed',
        date: new Date().toISOString(),
        note: 'Đối tác đã in phiếu giao hàng thành công.'
      };

      return {
        ...current,
        timeline: [newTimelineItem, ...current.timeline]
      };
    });
  };

  const shippingAddress = [order.shippingAddress.address, order.shippingAddress.ward, order.shippingAddress.district, order.shippingAddress.city].filter(Boolean).join(', ');
  const statusLabel = getVendorOrderStatusLabel(order.status);
  const statusTone = getVendorOrderStatusTone(order.status);

  const canConfirm = order.status === 'pending';
  const canProcess = order.status === 'confirmed';
  const canShip = order.status === 'processing';
  const canDeliver = order.status === 'shipped';
  const canCancel = order.status === 'pending' || order.status === 'confirmed' || order.status === 'processing';
  return (
    <VendorLayout
      title={
        <span className="vendor-order-detail-title">
          <button className="admin-ghost-btn vendor-order-detail-back-btn" aria-label="Quay lại" onClick={() => navigate('/vendor/orders')}>
            ←
          </button>
          <span>{`Đơn hàng #${toDisplayOrderCode(order.code)}`}</span>
        </span>
      }
      breadcrumbs={['Kênh Người Bán', 'Đơn hàng', 'Chi tiết']}
      actions={(
        <div className="admin-actions">
          <button className="admin-ghost-btn" onClick={handlePrintDeliveryNote}>
            <Printer size={16} />
            In phiếu giao
          </button>
          {canConfirm && (
            <button className="admin-primary-btn vendor-admin-primary" onClick={() => void updateStatus('CONFIRMED', 'confirmed', 'Đã xác nhận đơn hàng')} disabled={isProcessing}>
              <CheckCircle2 size={16} />
              {isProcessing ? 'Đang xử lý...' : 'Xác nhận đơn'}
            </button>
          )}
          {canProcess && (
            <button className="admin-primary-btn vendor-admin-primary" onClick={() => void updateStatus('PROCESSING', 'processing', 'Đơn hàng đã chuyển sang đang xử lý')} disabled={isProcessing}>
              <Package size={16} />
              {isProcessing ? 'Đang xử lý...' : 'Bắt đầu xử lý'}
            </button>
          )}
          {canShip && (
            <button className="admin-primary-btn vendor-admin-primary" onClick={() => void shipOrder()} disabled={isProcessing}>
              <Truck size={16} />
              {isProcessing ? 'Đang xử lý...' : 'Bàn giao vận chuyển'}
            </button>
          )}
          {canDeliver && (
            <button className="admin-primary-btn vendor-admin-primary" onClick={() => void updateStatus('DELIVERED', 'delivered', 'Đơn hàng đã được xác nhận giao thành công')} disabled={isProcessing}>
              <CheckCircle2 size={16} />
              {isProcessing ? 'Đang xử lý...' : 'Xác nhận đã giao'}
            </button>
          )}
          {canCancel && (
            <button className="admin-ghost-btn danger" onClick={() => void updateStatus('CANCELLED', 'cancelled', 'Đã hủy đơn hàng')} disabled={isProcessing}>
              <XCircle size={16} />
              Hủy đơn
            </button>
          )}
        </div>
      )}
    >
      {loading ? (
        <AdminStateBlock
          type="empty"
          title="Đang tải chi tiết đơn hàng"
          description="Đơn hàng của shop đang được đồng bộ."
        />
      ) : loadError ? (
        <AdminStateBlock
          type="error"
          title="Không tải được chi tiết đơn hàng"
          description={loadError}
          actionLabel="Thử lại"
          onAction={() => setReloadKey((key) => key + 1)}
        />
      ) : (
        <motion.div className="order-detail-grid od-theme od-theme-vendor">
          <div className="od-left">
            <section className="od-section">
              <div className="od-section-head">
                <h2><Package size={16} /> Hàng hóa ({order.items.length} SKU)</h2>
              </div>
              <div className="od-items">
                {order.items.map((item) => (
                  <div key={item.id} className="od-item">
                    <img src={getOptimizedImageUrl(item.image, { width: 100, format: 'webp' })} alt={item.name} />
                    <div className="od-item-info">
                      <p className="od-item-name">{item.name}</p>
                      <p className="od-item-variant">SKU: <strong>{item.sku}</strong> · {item.variant}</p>
                      <p className="od-item-price">{item.quantity} x {formatCurrency(item.price)}</p>
                    </div>
                    <div className="od-item-total">{formatCurrency(item.price * item.quantity)}</div>
                  </div>
                ))}
              </div>
              <div className="od-summary">
                <div className="od-summary-row"><span>Tạm tính</span><strong>{formatCurrency(order.subtotal)}</strong></div>
                <div className="od-summary-row"><span>Phí vận chuyển</span><strong>{order.shippingFee === 0 ? 'Miễn phí' : formatCurrency(order.shippingFee)}</strong></div>
                {order.discount > 0 && (
                  <div className="od-summary-row od-summary-discount">
                    <span className="od-summary-discount-label">
                      Voucher giảm giá
                      <span className="vendor-sponsor-badge">Sàn tài trợ</span>
                    </span>
                    <strong className="vendor-money-positive">-{formatCurrency(order.discount)}</strong>
                  </div>
                )}
                <div className="od-summary-row od-total"><span>Khách thanh toán</span><strong>{formatCurrency(order.total)}</strong></div>
              </div>

              <div className="od-commission-card vendor-reconciliation-card">
                <div className="vendor-reconciliation-head">
                  <Store size={16} />
                  <h3>
                    Đối soát shop
                  </h3>
                </div>
                <div className="vendor-reconciliation-lines">
                  <div className="vendor-reconciliation-row">
                    <span>Khách thanh toán</span>
                    <strong>{formatCurrency(order.total)}</strong>
                  </div>
                  {order.discount > 0 && (
                    <div className="vendor-reconciliation-row">
                      <span>Sàn hoàn lại Voucher</span>
                      <strong className="vendor-money-positive">+{formatCurrency(order.discount)}</strong>
                    </div>
                  )}
                  <div className="vendor-reconciliation-row">
                    <span className="vendor-reconciliation-label-icon">
                      <Percent size={12} />
                      Phí sàn {order.commissionRateApplied != null ? `(${order.commissionRateApplied}%)` : ''}
                    </span>
                    <strong className="vendor-money-warning">-{formatCurrency(order.commissionFee)}</strong>
                  </div>
                  <div className="vendor-reconciliation-divider" />
                  <div className="vendor-reconciliation-row total">
                    <span>Thực nhận</span>
                    <strong>{formatCurrency(order.vendorPayout)}</strong>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="od-right">
            <section className="od-section">
              <div className="od-section-head">
                <h2><User size={16} /> Thông tin đơn hàng</h2>
              </div>
              <div className="od-card">
                <div className="od-card-row">
                  <span className="od-label">Trạng thái</span>
                  <span className={`admin-pill ${statusTone}`}>{statusLabel}</span>
                </div>
                <div className="od-card-row">
                  <span className="od-label">Mã đơn hàng</span>
                  <div className="tracking-value">
                    <strong>{toDisplayOrderCode(order.code)}</strong>
                    <button className="admin-icon-btn subtle" aria-label="Sao chép mã đơn" onClick={() => void handleCopyOrderId()}>
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
                <div className="od-card-row">
                  <span className="od-label">Ngày tạo</span>
                  <span>{formatVendorOrderDate(order.createdAt, true)}</span>
                </div>
              </div>
            </section>

            <section className="od-section">
              <div className="od-section-head">
                <h2><User size={16} /> Khách hàng</h2>
              </div>
              <div className="od-card">
                <div className="od-card-row"><span className="od-label">Tên khách</span><strong>{order.customer.name}</strong></div>
                <div className="od-card-row"><span className="od-label">Điện thoại</span><strong>{order.customer.phone}</strong></div>
                <div className="od-card-row"><span className="od-label">Email</span><span>{order.customer.email}</span></div>
              </div>
            </section>

            <section className="od-section">
              <div className="od-section-head">
                <h2><MapPin size={16} /> Giao nhận & vận chuyển</h2>
              </div>
              <div className="od-card">
                <div className="od-card-row"><span className="od-label">Người nhận</span><strong>{order.shippingAddress.fullName}</strong></div>
                <div className="od-card-row"><span className="od-label">Điện thoại</span><span>{order.shippingAddress.phone}</span></div>
                <div className="od-card-row"><span className="od-label">Địa chỉ</span><span>{shippingAddress || 'Chưa cập nhật'}</span></div>
                <div className="od-card-row">
                  <span className="od-label">Phương thức TT</span>
                  <span>{order.paymentMethod}</span>
                </div>
                <div className="od-card-row">
                  <span className="od-label">Thanh toán</span>
                  <span className={`admin-pill ${order.paymentStatus === 'paid' ? 'success' : 'pending'}`}>
                    {order.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                  </span>
                </div>
                <div className="od-card-row tracking-row">
                  <span className="od-label">Mã vận đơn</span>
                  <div className="tracking-value">
                    <strong>{order.trackingNumber || '-'}</strong>
                    {order.trackingNumber && (
                      <button className="admin-icon-btn subtle" aria-label="Sao chép mã vận đơn" onClick={() => void handleCopyTracking()}>
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="od-card-row">
                  <span className="od-label">Đơn vị vận chuyển</span>
                  <span>{order.carrier || 'Chưa xác định'}</span>
                </div>
                {order.note && (
                  <div className="od-note">Ghi chú: {order.note}</div>
                )}
              </div>
            </section>

            <section className="od-section">
              <div className="od-section-head">
                <h2><Truck size={16} /> Timeline vận hành</h2>
              </div>
              <div className="od-timeline">
                {order.timeline.length === 0 ? (
                  <p className="admin-muted vendor-timeline-empty">Chưa có cập nhật vận hành.</p>
                ) : (
                  order.timeline.map((log, idx) => (
                    <div key={idx} className="od-timeline-item">
                      <div className={`od-timeline-dot ${log.status === 'cancelled' ? 'error' : log.status === 'delivered' || log.status === 'done' ? 'success' : 'neutral'}`} />
                      <div>
                        <p className="od-timeline-time">{new Date(log.date).toLocaleString('vi-VN')}</p>
                        <p className="od-timeline-text">{getVendorOrderStatusLabel(log.status)}{log.note ? ` - ${log.note}` : ''}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </motion.div>
      )}
      {createPortal(<VendorOrderPrintTemplate order={order} />, document.body)}
    </VendorLayout>
  );
};

export default VendorOrderDetail;
