import { Loader2 } from 'lucide-react';
import { CLIENT_TEXT } from '../../../utils/texts';
import { formatPrice } from '../../../utils/formatters';
import type { CheckoutCoupon, CheckoutPaymentMethod } from '../checkout.types';
import './CheckoutOrderSummarySection.css';

const t = CLIENT_TEXT.checkout;

const paymentIndicatorMap: Record<CheckoutPaymentMethod, { icon: string; alt: string; label: string }> = {
  vnpay: {
    icon: 'https://mcdn.coolmate.me/image/October2024/mceclip0_81.png',
    alt: 'VNPAY',
    label: 'VNPAY / TháiQR',
  },
  momo: {
    icon: 'https://mcdn.coolmate.me/image/October2024/mceclip1_171.png',
    alt: 'MoMo',
    label: t.paymentMethods.momo,
  },
  cod: {
    icon: 'https://mcdn.coolmate.me/image/October2024/mceclip2_42.png',
    alt: 'COD',
    label: t.paymentMethods.cod,
  },
};

interface CheckoutStickyOrderBarProps {
  paymentMethod: CheckoutPaymentMethod;
  appliedCoupon: CheckoutCoupon | null;
  total: number;
  savings: number;
  isLoading: boolean;
  disabled: boolean;
  onPlaceOrder: () => void;
}

const CheckoutStickyOrderBar = ({ paymentMethod, appliedCoupon, total, savings, isLoading, disabled, onPlaceOrder }: CheckoutStickyOrderBarProps) => {
  const paymentIndicator = paymentIndicatorMap[paymentMethod];

  return (
    <div className="bottom-sticky-bar">
      <div className="bottom-bar-inner">
        <div className="bottom-bar-left">
          <div className="bar-left-content">
            <div className="payment-method-indicator">
              <img src={paymentIndicator.icon} alt={paymentIndicator.alt} className="payment-icon-img" />
              <strong>{paymentIndicator.label}</strong>
            </div>
            <div className="bar-divider"></div>
            <div className="voucher-indicator">
              <img src="https://n7media.coolmate.me/uploads/March2024/voucher-logo-mb.png?aio=w-300" alt="Voucher" className="voucher-icon-img" />
              {appliedCoupon ? (
                <span className="voucher-code-text">{appliedCoupon.code}</span>
              ) : (
                <span>{t.walletVoucher}</span>
              )}
            </div>
          </div>
        </div>

        <div className="bottom-bar-right">
          <div className="bar-price-block">
            <div className="bar-price-main">{formatPrice(total)}</div>
            <div className="bar-price-points">
              <span>Điểm tích lũy: <span className="points-value">+{Math.floor(total / 1000).toLocaleString('vi-VN')}</span></span>
              {savings > 0 && (
                <span className="savings-text"> | Tiết kiệm: <span className="sub-value">{formatPrice(savings)}</span></span>
              )}
            </div>
          </div>
          <button className="btn-place-order-sticky" onClick={onPlaceOrder} disabled={isLoading || disabled}>
            {isLoading ? <Loader2 size={24} className="spinner" /> : t.orderPlaced}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutStickyOrderBar;
