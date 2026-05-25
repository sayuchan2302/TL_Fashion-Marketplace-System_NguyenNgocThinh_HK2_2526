import { CLIENT_TEXT } from '../../../utils/texts';
import { formatPrice } from '../../../utils/formatters';
import type { CheckoutCoupon } from '../checkout.types';
import './CheckoutOrderSummarySection.css';

const t = CLIENT_TEXT.checkout;

interface CheckoutOrderSummarySectionProps {
  appliedCoupon: CheckoutCoupon | null;
  subtotal: number;
  shippingFee: number | null;
  discount: number;
  total: number;
  savings: number;
}

const CheckoutOrderSummarySection = ({ appliedCoupon, subtotal, shippingFee, discount, total, savings }: CheckoutOrderSummarySectionProps) => (
  <div className="checkout-calculations">
    <h3 className="calc-title">{t.orderSummary.title}</h3>

    <div className="calc-row">
      <span className="calc-label">{t.productValue}</span>
      <span>{formatPrice(subtotal)}</span>
    </div>

    <div className="calc-row">
      <span className="calc-label">{t.shippingCost}</span>
      <span>{shippingFee === null ? '---' : (shippingFee === 0 ? t.free : formatPrice(shippingFee))}</span>
    </div>

    {appliedCoupon && discount > 0 && (
      <div className="calc-row calc-discount">
        <span className="calc-label">{t.discount.replace('{code}', appliedCoupon.code)}</span>
        <span className="discount-value">-{formatPrice(discount)}</span>
      </div>
    )}

    <div className="calc-row calc-total">
      <strong>{t.total}</strong>
      <div className="total-value-block">
        <strong className="total-price-big">{formatPrice(total)}</strong>
        {savings > 0 && <div className="savings-note">Tiết kiệm {formatPrice(savings)}</div>}
        <div className="vat-note">(Đã bao gồm VAT nếu có)</div>
      </div>
    </div>
  </div>
);

export default CheckoutOrderSummarySection;
