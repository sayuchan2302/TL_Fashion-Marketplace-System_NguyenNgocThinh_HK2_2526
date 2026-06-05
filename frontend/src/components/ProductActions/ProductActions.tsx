import { useState } from 'react';
import { Minus, Plus, ShoppingCart, Check, Heart } from 'lucide-react';
import { useCartAnimation } from '../../context/CartAnimationContext';
import { useWishlist } from '../../contexts/WishlistContext';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../../contexts/ToastContext';
import { productService } from '../../services/productService';
import './ProductActions.css';

interface ProductActionsProps {
  product: {
    id: number | string;
    backendId?: string;
    name: string;
    price: number;
    originalPrice?: number;
    image: string;
    storeId?: string;
    storeName?: string;
    isOfficialStore?: boolean;
    status?: string;
    stock?: number;
    variants?: Array<{
      color: string;
      size: string;
      backendId?: string;
    }>;
  };
  selectedColor: string;
  selectedSize: string;
}

const ProductActions = ({ product, selectedColor, selectedSize }: ProductActionsProps) => {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { addToCart } = useCart();
  const { addToast } = useToast();
  const { triggerAnimation } = useCartAnimation();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const isWished = isInWishlist(String(product.id));

  const handleBuyNow = async (e: React.MouseEvent) => {
    // Trigger animation immediately for instant feedback
    const mainImg = document.querySelector('.gallery-main-image .main-image') as HTMLImageElement | null;
    triggerAnimation({
      imgSrc: product.image,
      imageRect: mainImg?.getBoundingClientRect() || null,
      fallbackPoint: { x: e.clientX, y: e.clientY },
    });
    setAdded(true);

    const localVariantId = product.variants?.find((variant) => (
      variant.color.toLowerCase() === selectedColor.toLowerCase()
      && variant.size.toLowerCase() === selectedSize.toLowerCase()
    ))?.backendId;
    const purchaseReference = localVariantId
      ? { backendProductId: product.backendId, backendVariantId: localVariantId, activeVariantCount: product.variants?.length || 0 }
      : await productService.resolvePurchaseReference(
        String(product.backendId || product.id),
        selectedColor || undefined,
        selectedSize || undefined,
        { forceRefresh: true, strictPublic: Boolean(product.backendId) },
      );

    if (!purchaseReference.backendProductId) {
      addToast('Sản phẩm chưa đồng bộ backend, vui lòng thử lại.', 'error');
      setAdded(false);
      return;
    }
    if (!purchaseReference.backendVariantId && (purchaseReference.activeVariantCount || 0) > 1) {
      addToast('Vui lòng chọn đúng màu/size trước khi thêm vào giỏ.', 'error');
      setAdded(false);
      return;
    }

    addToCart({
      id: product.id,
      backendProductId: purchaseReference.backendProductId,
      backendVariantId: purchaseReference.backendVariantId,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice,
      image: product.image,
      color: selectedColor,
      size: selectedSize,
      storeId: product.storeId,
      storeName: product.storeName,
      isOfficialStore: product.isOfficialStore,
      quantity,
    });
    setTimeout(() => setAdded(false), 2000);
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isWished) {
      removeFromWishlist(String(product.id));
    } else {
      const mainImg = document.querySelector('.gallery-main-image .main-image') as HTMLImageElement | null;
      triggerAnimation({
        imgSrc: product.image,
        imageRect: mainImg?.getBoundingClientRect() || null,
        fallbackPoint: { x: e.clientX, y: e.clientY },
        target: 'wishlist',
      });
      addToWishlist({
        id: String(product.id),
        name: product.name,
        price: product.price,
        originalPrice: product.originalPrice,
        image: product.image,
        storeId: product.storeId,
        storeName: product.storeName,
        isOfficialStore: product.isOfficialStore,
      });
    }
  };

  return (
    <div className="product-actions-container">
      {/* Quantity Selector */}
      <div className="quantity-wrapper">
        <button 
          className="qty-btn" 
          onClick={() => setQuantity(q => Math.max(1, q - 1))}
          aria-label="Decrease quantity"
          disabled={quantity <= 1}
        >
          <Minus size={16} />
        </button>
        <input 
          type="number" 
          className="qty-input" 
          value={quantity} 
          readOnly 
        />
        <button 
          className="qty-btn" 
          onClick={() => setQuantity(q => Math.min(10, q + 1))}
          aria-label="Increase quantity"
          disabled={quantity >= 10}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        {/* Buy Now - Add to Cart */}
        <button
          className={`btn-buy-now ${added ? 'added' : ''}`}
          onClick={handleBuyNow}
        >
          {added ? (
            <><Check size={18} /> Đã thêm</>
          ) : (
            <><ShoppingCart size={18} /> Thêm vào giỏ</>
          )}
        </button>
        {/* Wishlist Button */}
        <button 
          className={`btn-wishlist-action ${isWished ? 'wished' : ''}`}
          onClick={handleToggleWishlist}
          aria-label={isWished ? "Xoá khỏi yêu thích" : "Thêm vào yêu thích"}
        >
          <Heart size={24} fill={isWished ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Trust Badges Minimal */}
      <ul className="action-trust-list">
        <li>Đổi trả cực dễ chỉ cần số điện thoại</li>
        <li>60 ngày đổi trả vì bất kỳ lý do gì</li>
        <li>Hotline 1900.27.27.37 hỗ trợ từ 8h30 - 22h mỗi ngày</li>
      </ul>
    </div>
  );
};

export default ProductActions;
