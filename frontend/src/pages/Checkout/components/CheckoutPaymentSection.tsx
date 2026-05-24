import { Link } from 'react-router-dom';
import { CLIENT_TEXT } from '../../../utils/texts';
import type { CheckoutPaymentMethod } from '../checkout.types';
import './CheckoutPaymentSection.css';

const t = CLIENT_TEXT.checkout;
const tCommon = CLIENT_TEXT.common;

const paymentOptions: Array<{
  id: CheckoutPaymentMethod;
  icon: string;
  alt: string;
  label: string;
  description?: string;
  promo?: string;
}> = [
  {
    id: 'cod',
    icon: 'https://mcdn.coolmate.me/image/October2024/mceclip2_42.png',
    alt: 'COD',
    label: t.paymentMethods.cod,
  },
  {
    id: 'zalopay',
    icon: 'https://mcdn.coolmate.me/image/October2024/mceclip3_6.png',
    alt: 'ZaloPay',
    label: t.paymentMethods.zalopay,
    description: t.paymentMethods.zalopayDesc,
  },
  {
    id: 'momo',
    icon: 'https://mcdn.coolmate.me/image/October2024/mceclip1_171.png',
    alt: 'MoMo',
    label: t.paymentMethods.momo,
  },
  {
    id: 'vnpay',
    icon: 'https://mcdn.coolmate.me/image/October2024/mceclip0_81.png',
    alt: 'VNPay',
    label: t.paymentMethods.vnpay,
  },
];


interface CheckoutPaymentSectionProps {
  paymentMethod: CheckoutPaymentMethod;
  onPaymentMethodChange: (method: CheckoutPaymentMethod) => void;
}

const CheckoutPaymentSection = ({ paymentMethod, onPaymentMethodChange }: CheckoutPaymentSectionProps) => (
  <section className="checkout-section">
    <h2 className="checkout-section-title">{t.payment}</h2>
    <div className="payment-options-list">
      {paymentOptions.map((option) => (
        <label key={option.id} className={`payment-card ${paymentMethod === option.id ? 'selected' : ''}`}>
          <input
            type="radio"
            name="payment"
            value={option.id}
            checked={paymentMethod === option.id}
            onChange={() => onPaymentMethodChange(option.id)}
          />
          <span className="radio-circle"></span>
          <div className="payment-info payment-col">
            <div className="payment-row">
              <img src={option.icon} alt={option.alt} className="payment-icon" width={50} height={50} loading="lazy" />
              <div>
                <span className="payment-name-text">{option.label}</span>
                {option.description && <span className="payment-sub-text">{option.description}</span>}
                {option.promo && <span className="vnpay-promo-badge">{option.promo}</span>}
              </div>
            </div>
          </div>
        </label>
      ))}
    </div>
    <div className="payment-return-policy">
      {t.returnPolicy} <Link to="#">{tCommon.actions.viewDetails}</Link>.
    </div>
  </section>
);

export default CheckoutPaymentSection;
