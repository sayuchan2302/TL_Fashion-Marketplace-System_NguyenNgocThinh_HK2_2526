import { useLayoutEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ChevronRight, ShieldCheck, Truck, ShoppingCart, Store, BadgeCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import EmptyState from '../../components/EmptyState/EmptyState';
import { useCart, type StoreGroup } from '../../contexts/CartContext';
import { useToast } from '../../contexts/ToastContext';
import { hasBackendJwt } from '../../services/apiClient';
import { setSelectedCartIdsForCheckout } from '../../services/checkoutSelectionStore';
import { formatPrice } from '../../utils/formatters';
import { CLIENT_TEXT } from '../../utils/texts';
import { MARKETPLACE_DICTIONARY } from '../../utils/clientDictionary';
import './Cart.css';

const t = CLIENT_TEXT.cart;
const tCommon = CLIENT_TEXT.common;
const tMarket = MARKETPLACE_DICTIONARY.cart;

const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const },
};

const itemTransition = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20, height: 0, marginBottom: 0, padding: 0 },
  transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const },
};

const storeGroupTransition = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
};


const Cart = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { items, updateQuantity, removeFromCart, groupedByStore } = useCart();
  const [selectedItems, setSelectedItems] = useState<string[]>(items.map(i => i.cartId));
  const [collapsedStores, setCollapsedStores] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const scrollRoot = document.scrollingElement as HTMLElement | null;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    scrollRoot?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const raf = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      scrollRoot?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const storeGroups: StoreGroup[] = groupedByStore();
  
  const validSelectedItems = selectedItems.filter(id => items.some(i => i.cartId === id));
  const selectedItemsList = items.filter(item => validSelectedItems.includes(item.cartId));
  
  // Calculate selected subtotal/shipping per store for right summary only.
  const calculateSelectedStoreTotals = (group: StoreGroup) => {
    const groupSelectedItems = group.items.filter(item => validSelectedItems.includes(item.cartId));
    const subtotal = groupSelectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalOriginal = groupSelectedItems.reduce((sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity, 0);
    const discount = totalOriginal - subtotal;
    const shippingFee = subtotal === 0 ? 0 : 30000;
    return { subtotal, discount, shippingFee, total: subtotal + shippingFee };
  };

  // Global totals
  const globalSubtotal = selectedItemsList.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const globalTotalOriginal = selectedItemsList.reduce((sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity, 0);
  const globalDiscount = globalTotalOriginal - globalSubtotal;
  
  const totalShipping = storeGroups.reduce((sum, group) => {
    const { shippingFee } = calculateSelectedStoreTotals(group);
    return sum + shippingFee;
  }, 0);
  
  const globalTotal = globalSubtotal + totalShipping;

  const handleQuantityChange = (cartId: string, delta: number) => {
    const item = items.find(i => i.cartId === cartId);
    if (item) updateQuantity(cartId, item.quantity + delta);
  };

  const handleRemoveItem = (cartId: string) => {
    removeFromCart(cartId);
    setSelectedItems(prev => prev.filter(id => id !== cartId));
  };

  const toggleSelectAll = () => {
    if (validSelectedItems.length === items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map(item => item.cartId));
    }
  };

  const toggleSelectItem = (cartId: string) => {
    if (validSelectedItems.includes(cartId)) {
      setSelectedItems(validSelectedItems.filter(id => id !== cartId));
    } else {
      setSelectedItems([...validSelectedItems, cartId]);
    }
  };

  const toggleStoreCollapse = (storeId: string) => {
    setCollapsedStores(prev => {
      const next = new Set(prev);
      if (next.has(storeId)) {
        next.delete(storeId);
      } else {
        next.add(storeId);
      }
      return next;
    });
  };

  const selectStoreGroup = (storeId: string) => {
    const group = storeGroups.find(g => g.storeId === storeId);
    if (!group) return;
    
    const allSelected = group.items.every(item => validSelectedItems.includes(item.cartId));
    const groupItemIds = group.items.map(item => item.cartId);
    
    if (allSelected) {
      setSelectedItems(prev => prev.filter(id => !groupItemIds.includes(id)));
    } else {
      setSelectedItems(prev => [...prev, ...groupItemIds.filter(id => !prev.includes(id))]);
    }
  };

  if (items.length === 0) {
    return (
      <div className="cart-page">
        <div className="cart-container">
          <h1 className="cart-page-title">{t.title}</h1>
          <EmptyState
            icon={<ShoppingCart size={72} strokeWidth={1} />}
            title={t.empty.title}
            description={t.empty.description}
            actionText={t.empty.action}
            actionLink="/"
          />
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="cart-page"
      {...pageTransition}
    >
      <div className="cart-container">
        {/* Breadcrumb */}
        <nav className="cart-breadcrumb">
          <Link to="/" className="breadcrumb-link">{tCommon.breadcrumb.home}</Link>
          <ChevronRight size={14} />
          <span className="breadcrumb-active">{tCommon.breadcrumb.cart} ({items.length})</span>
        </nav>

        <h1 className="cart-page-title">{t.title}</h1>

        {/* Multi-vendor Notice */}
        {storeGroups.length > 1 && (
          <motion.div 
            className="cart-multi-vendor-notice"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Store size={16} />
            <span>{tMarket.splitOrder}</span>
          </motion.div>
        )}

        <div className="cart-layout">
          {/* ========== LEFT: Items by Store ========== */}
          <div className="cart-left-col">

            {/* Select All Header */}
            <div className="cart-select-header">
              <label className="custom-checkbox-label">
                <input type="checkbox"
                  checked={validSelectedItems.length === items.length && items.length > 0}
                  onChange={toggleSelectAll} />
                <span className="checkbox-icon"></span>
                <span>{t.selectAll} ({t.productCount(items.length)})</span>
              </label>
            </div>

            {/* Store Groups */}
            <AnimatePresence mode="popLayout">
              {storeGroups.map((group, groupIndex) => {
                const isCollapsed = collapsedStores.has(group.storeId);
                const isStoreSelected = group.items.every(item => validSelectedItems.includes(item.cartId));

                return (
                  <motion.div 
                    key={group.storeId}
                    className="store-group"
                    {...storeGroupTransition}
                    transition={{ delay: groupIndex * 0.05 }}
                  >
                    {/* Store Header */}
                    <motion.div 
                      className="store-group-header"
                      onClick={() => toggleStoreCollapse(group.storeId)}
                    >
                      <label className="custom-checkbox-label store-checkbox" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox"
                          checked={isStoreSelected}
                          onChange={() => selectStoreGroup(group.storeId)}
                        />
                        <span className="checkbox-icon"></span>
                      </label>
                      
                      <div className="store-info">
                        <div className="store-name-row">
                          {group.isOfficialStore && (
                            <span className="store-official-badge" title={tMarket.official}>
                              <BadgeCheck size={14} />
                            </span>
                          )}
                          <span className="store-name">{group.storeName}</span>
                        </div>
                        <span className="store-item-count">
                          {group.items.length} sản phẩm
                        </span>
                      </div>

                      <motion.button 
                        className="store-collapse-btn"
                        animate={{ rotate: isCollapsed ? -90 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronRight size={18} />
                      </motion.button>
                    </motion.div>

                    {/* Store Items */}
                    <AnimatePresence>
                      {!isCollapsed && group.items.map((item) => (
                        <motion.div 
                          className="cart-item-card"
                          key={item.cartId}
                          layout
                          {...itemTransition}
                        >
                          <label className="custom-checkbox-label item-cb">
                            <input type="checkbox"
                              checked={validSelectedItems.includes(item.cartId)}
                              onChange={() => toggleSelectItem(item.cartId)} />
                            <span className="checkbox-icon"></span>
                          </label>

                          <Link to={`/product/${item.id}`} className="item-img-link">
                            <img src={item.image} alt={item.name} className="item-img" />
                          </Link>

                          <div className="item-details">
                            <div className="item-top-row">
                              <Link to={`/product/${item.id}`} className="item-name">{item.name}</Link>
                              <motion.button 
                                className="btn-remove" 
                                onClick={() => handleRemoveItem(item.cartId)}
                                aria-label={tCommon.actions.delete}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                              >
                                <Trash2 size={18} />
                              </motion.button>
                            </div>
                            <div className="item-variant">{item.color} / {item.size}</div>
                            <div className="item-bottom-row">
                              <div className="item-prices">
                                <span className="price-current">{formatPrice(item.price)}</span>
                                {item.originalPrice !== undefined && item.originalPrice > item.price && (
                                  <span className="price-original">{formatPrice(item.originalPrice)}</span>
                                )}
                              </div>
                              <div className="qty-control">
                                <button className="qty-btn" onClick={() => handleQuantityChange(item.cartId, -1)} disabled={item.quantity <= 1}>−</button>
                                <span className="qty-val">{item.quantity}</span>
                                <button className="qty-btn" onClick={() => handleQuantityChange(item.cartId, 1)}>+</button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* ========== RIGHT: Summary ========== */}
          <div className="cart-right-col">
            <div className="cart-summary-card">
              <h2 className="summary-title">{tCommon.actions.viewDetails}</h2>

              <div className="summary-lines">
                <div className="sum-row">
                  <span>{t.subtotal}</span>
                  <span>{formatPrice(globalSubtotal)}</span>
                </div>
                {globalDiscount > 0 && (
                  <div className="sum-row discount">
                    <span>{t.discount}</span>
                    <span>-{formatPrice(globalDiscount)}</span>
                  </div>
                )}
                <div className="sum-row">
                  <span>{t.shipping}</span>
                  <span>{totalShipping === 0 ? t.freeShipping : formatPrice(totalShipping)}</span>
                </div>
                <div className="sum-divider"></div>
                <div className="sum-row sum-total">
                  <strong>{t.total}</strong>
                  <div className="total-block">
                    <strong className="total-big">{formatPrice(globalTotal)}</strong>
                    <span className="vat-note">{t.vatNote}</span>
                  </div>
                </div>
              </div>

              <button className="btn-checkout"
                disabled={validSelectedItems.length === 0}
                onClick={() => {
                  if (!hasBackendJwt()) {
                    addToast('Vui lòng đăng nhập để thanh toán đơn hàng', 'error');
                    navigate('/login?redirect=/checkout');
                    return;
                  }
                  setSelectedCartIdsForCheckout(validSelectedItems);
                  navigate('/checkout');
                }}>
                {t.proceedCheckout}
              </button>

              {/* Trust Badges */}
              <div className="trust-badges">
                <div className="badge-box">
                  <ShieldCheck size={22} />
                  <span>{t.trustBadges.secure}</span>
                </div>
                <div className="badge-box">
                  <Truck size={22} />
                  <span>{t.trustBadges.returns}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Cart;
