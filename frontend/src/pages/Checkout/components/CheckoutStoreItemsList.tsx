import { ChevronRight, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CartItem } from '../../../contexts/CartContext';
import { formatPrice } from '../../../utils/formatters';
import { CLIENT_TEXT } from '../../../utils/texts';
import './CheckoutStoreItemsList.css';

const t = CLIENT_TEXT.checkout;

interface CheckoutStoreItemsListProps {
  checkoutItems: CartItem[];
  subtotal: number;
  onRemoveItem: (cartId: string) => void;
  onQuantityChange: (cartId: string, delta: number) => void;
}

const CheckoutStoreItemsList = ({ checkoutItems, onRemoveItem, onQuantityChange }: CheckoutStoreItemsListProps) => (
  <>
    <div className="cart-header-actions">
      <span className="cart-item-count">{t.cartItemCount.replace('{count}', String(checkoutItems.length))}</span>
    </div>

    <div className="unified-cart-list">
      {checkoutItems.length === 0 ? (
        <div className="empty-cart-msg">{t.emptyCart}</div>
      ) : (
        checkoutItems.map((item) => (
          <div className="unified-cart-item" key={item.cartId}>
            <img src={item.image} alt={item.name} className="unified-item-img" />

            <div className="unified-item-info">
              <Link to={`/product/${item.id}`} className="unified-item-name">{item.name}</Link>
              <div className="variant-selectors">
                <div className="fake-select">{item.color} <ChevronRight size={14} /></div>
                <div className="fake-select">{item.size} <ChevronRight size={14} /></div>
              </div>
              <button className="unified-item-remove" onClick={() => onRemoveItem(item.cartId)} aria-label={t.remove}>
                <Trash2 size={14} aria-hidden="true" /> {t.remove}
              </button>
            </div>

            <div className="unified-qty-price">
              <div className="unified-qty-control">
                <button onClick={() => onQuantityChange(item.cartId, -1)} disabled={item.quantity <= 1} aria-label="Giảm số lượng">-</button>
                <span>{item.quantity}</span>
                <button onClick={() => onQuantityChange(item.cartId, 1)} aria-label="Tăng số lượng">+</button>
              </div>
              <div className="unified-item-price">{formatPrice(item.price)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  </>
);

export default CheckoutStoreItemsList;
