import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronRight, Star, MessageSquare, X, Flag } from 'lucide-react';
import ProductGallery from '../../components/ProductGallery/ProductGallery';
import ProductInfo from '../../components/ProductInfo/ProductInfo';
import ProductActions from '../../components/ProductActions/ProductActions';
import ProductDescription from '../../components/ProductDescription/ProductDescription';
import ProductDetailSkeleton from '../../components/ProductDetailSkeleton/ProductDetailSkeleton';
import StoreInfoCard from '../../components/StoreInfoCard/StoreInfoCard';
import { productService } from '../../services/productService';
import { reviewService, type Review } from '../../services/reviewService';
import { CLIENT_TEXT } from '../../utils/texts';
import { CLIENT_DICTIONARY } from '../../utils/clientDictionary';
import type { Product } from '../../types';
import { normalizeStoreSlug } from '../../utils/storeIdentity';
import { usePageTitle } from '../../hooks/usePageTitle';
import ReportProductModal from '../../components/ReportProductModal/ReportProductModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import './ProductDetail.css';

const t = CLIENT_TEXT.productDetail;

const renderRating = (value: number, size = 16) => (
  <div className="pdp-review-stars" aria-label={`Rating ${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        size={size}
        fill={value >= star ? '#f59e0b' : 'none'}
        stroke={value >= star ? '#f59e0b' : '#cbd5e1'}
        className={value >= star ? 'pdp-review-star-active' : 'pdp-review-star'}
      />
    ))}
  </div>
);

const formatReviewDateTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const getReviewerDisplayName = (review: Review): string => {
  const normalized = review.customerName?.trim();
  if (normalized) return normalized;
  const fromEmail = review.customerEmail?.split('@')[0]?.trim();
  if (fromEmail) return fromEmail;
  return 'Khách hàng';
};

const getReviewerInitials = (name: string): string => {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return letters || 'KH';
};

const formatPurchasedVariant = (variantName?: string): string => {
  const normalized = String(variantName || '').trim();
  if (!normalized) {
    return '';
  }

  const slashParts = normalized
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (slashParts.length === 2) {
    return `Màu ${slashParts[0]}, Size ${slashParts[1]}`;
  }

  if (slashParts.length === 1) {
    return slashParts[0];
  }

  return normalized;
};

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { addToast } = useToast();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [hasReportedLocally, setHasReportedLocally] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedReviewImage, setSelectedReviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');

  const productId = id || '';
  const storeSlug = normalizeStoreSlug(product?.storeSlug);
  const categoryLinkSlug = product?.categorySlug || product?.category || 'all';
  usePageTitle(product?.name || 'Sản phẩm');

  useEffect(() => {
    setIsReportModalOpen(false);
    setHasReportedLocally(false);
  }, [productId]);

  useEffect(() => {
    window.scrollTo(0, 0);
    let isMounted = true;

    const timer = setTimeout(() => {
      void (async () => {
        const fetched = (await productService.getByIdentifier(productId)) || productService.list()[0] || null;
        if (!isMounted) {
          return;
        }

        setProduct(fetched);

        if (fetched) {
          const defaultVariant = fetched.variants?.[0];
          setSelectedColor(defaultVariant?.color || fetched.colors?.[0] || '');
          setSelectedSize(defaultVariant?.size || '');
        }

        const backendProductId = fetched?.backendId || '';
        if (!backendProductId) {
          setReviews([]);
          setIsLoading(false);
          return;
        }

        try {
          const productReviews = await reviewService.getReviewsByProduct(backendProductId);

          if (!isMounted) {
            return;
          }

          setReviews(productReviews);
        } catch {
          if (!isMounted) {
            return;
          }

          setReviews([]);
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      })();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [productId]);
  const averageRating =
    reviews.length > 0 ? Number((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)) : null;

  const reviewBreakdown = useMemo(() => {
    const result = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: 0,
      ratio: 0,
    }));
    if (reviews.length === 0) return result;

    reviews.forEach((review) => {
      const clamped = Math.max(1, Math.min(5, Math.round(review.rating)));
      const target = result.find((entry) => entry.star === clamped);
      if (target) {
        target.count += 1;
      }
    });

    return result.map((entry) => ({
      ...entry,
      ratio: entry.count / reviews.length,
    }));
  }, [reviews]);

  const handleOpenReportModal = () => {
    if (!product?.backendId) {
      addToast('Sản phẩm chưa đồng bộ backend, chưa thể gửi tố cáo.', 'error');
      return;
    }

    if (!isAuthenticated) {
      addToast('Vui lòng đăng nhập để tố cáo sản phẩm.', 'info');
      const redirect = `${location.pathname}${location.search}`;
      navigate(`/login?reason=${encodeURIComponent('auth-required')}&redirect=${encodeURIComponent(redirect)}`);
      return;
    }

    if (user?.role !== 'CUSTOMER') {
      addToast('Chỉ tài khoản khách hàng mới có thể tố cáo sản phẩm.', 'info');
      return;
    }

    setIsReportModalOpen(true);
  };

  if (isLoading || !product) {
    return (
      <div className="pdp-page">
        <div className="container pdp-container">
          <ProductDetailSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="pdp-page">
      <div className="breadcrumb-wrapper">
        <div className="container">
          <nav className="breadcrumbs">
            <Link to="/" className="breadcrumb-link">
              {CLIENT_TEXT.common.breadcrumb.home}
            </Link>
            <ChevronRight size={14} className="breadcrumb-separator" />
            <Link to={`/category/${encodeURIComponent(categoryLinkSlug)}`} className="breadcrumb-link">
              {product.category || CLIENT_TEXT.productListing.title}
            </Link>
            <ChevronRight size={14} className="breadcrumb-separator" />
            <span className="breadcrumb-current">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="container pdp-container">
        <div className="pdp-top-section">
          <div className="pdp-gallery-col">
            <ProductGallery images={product.images && product.images.length > 0 ? product.images : [product.image]} />

            {storeSlug && (
              <StoreInfoCard
                storeId={product.storeId}
                storeName={product.storeName || 'Cửa hàng'}
                storeSlug={storeSlug}
                storeLogo={product.storeLogo}
                isOfficialStore={product.isOfficialStore}
              />
            )}
          </div>

          <div className="pdp-info-col">
            <ProductInfo
              product={product}
              averageRating={averageRating}
              reviewCount={reviews.length}
              onVariantChange={(color, size) => {
                setSelectedColor(color);
                setSelectedSize(size);
              }}
            />
            <ProductActions
              product={{
                id: product.sku,
                backendId: product.backendId,
                name: product.name,
                price: product.price,
                originalPrice: product.originalPrice,
                image: product.image,
                storeId: product.storeId,
                storeName: product.storeName,
                isOfficialStore: product.isOfficialStore,
              }}
              selectedColor={selectedColor}
              selectedSize={selectedSize}
            />
            <div className="pdp-review-summary">
              {averageRating !== null && (
                <div className="pdp-review-avg">
                  <Star size={15} fill="currentColor" className="pdp-star-filled" />
                  <span className="pdp-avg-value">{averageRating.toFixed(1)}</span>
                </div>
              )}
              <span className="pdp-review-count">
                {reviews.length} {CLIENT_DICTIONARY.reviews.countLabel}
              </span>
            </div>
            <div className="pd-size-help">
              <p className="pd-size-text">{t.sizeHelp.text}</p>
              <div className="pd-size-links">
                <Link to="/size-guide" className="pd-size-link">
                  {t.sizeHelp.sizeGuide}
                </Link>
                <Link to="/contact" className="pd-size-link">
                  {t.sizeHelp.consult}
                </Link>
                <button
                  type="button"
                  className={`pd-size-link pd-report-link ${hasReportedLocally ? 'reported' : ''}`}
                  onClick={handleOpenReportModal}
                  disabled={hasReportedLocally}
                  aria-label={hasReportedLocally ? 'Đã tố cáo sản phẩm' : 'Tố cáo sản phẩm'}
                >
                  <Flag size={14} />
                  {hasReportedLocally ? 'Đã tố cáo' : 'Tố cáo sản phẩm'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="pdp-bottom-section">
          <ProductDescription product={product} />

          <div className="pdp-reviews-section">
            <div className="pdp-reviews-header">
              <div className="pdp-reviews-title-row">
                <h3 className="pdp-reviews-title">{CLIENT_DICTIONARY.reviews.title}</h3>
                {averageRating !== null && (
                  <div className="pdp-rating-chip">
                    <Star size={14} fill="currentColor" />
                    {averageRating.toFixed(1)} / 5
                  </div>
                )}
              </div>
              <span className="pdp-reviews-badge">
                {reviews.length} {CLIENT_DICTIONARY.reviews.countLabel}
              </span>
            </div>

            {reviews.length > 0 ? (
              <div className="pdp-reviews-overview">
                <div className="pdp-reviews-overview-score">
                  <strong>{averageRating?.toFixed(1) || '0.0'}</strong>
                  <span>trên 5</span>
                  <div className="pdp-reviews-overview-stars">{renderRating(Math.round(averageRating || 0))}</div>
                  <p className="pdp-reviews-overview-total">
                    {reviews.length} {CLIENT_DICTIONARY.reviews.countLabel}
                  </p>
                </div>
                <div className="pdp-reviews-overview-bars">
                  {reviewBreakdown.map((entry) => {
                    const ratioPercent = Math.round(entry.ratio * 100);
                    return (
                      <div key={entry.star} className="pdp-reviews-bar-row">
                        <span className="pdp-reviews-bar-label">{entry.star} sao</span>
                        <div className="pdp-reviews-bar-track">
                          <span style={{ width: `${ratioPercent}%` }} />
                        </div>
                        <strong className="pdp-reviews-bar-count">{entry.count}</strong>
                        <span className="pdp-reviews-bar-percent">{ratioPercent}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {reviews.length === 0 ? (
              <div className="pdp-reviews-empty">
                <MessageSquare size={32} strokeWidth={1.5} />
                <p>{CLIENT_DICTIONARY.reviews.empty}</p>
              </div>
            ) : (
              <div className="pdp-reviews-list">
                {reviews.map((review) => {
                  const purchasedVariant = formatPurchasedVariant(review.variantName);
                  return (
                    <article key={review.id} className="pdp-review-card">
                      <div className="pdp-review-meta">
                        <div className="pdp-review-author">
                          <div className="pdp-review-avatar" aria-hidden="true">
                            {getReviewerInitials(getReviewerDisplayName(review))}
                          </div>
                          <div className="pdp-review-author-copy">
                            <p className="pdp-review-author-name">{getReviewerDisplayName(review)}</p>
                            <div className="pdp-review-author-rating">
                              {renderRating(review.rating, 14)}
                              <span className="pdp-review-rating-score">{review.rating}/5</span>
                            </div>
                          </div>
                        </div>
                        <div className="pdp-review-meta-side">
                          {purchasedVariant ? (
                            <span className="pdp-review-variant" title={purchasedVariant}>
                              Phân loại: {purchasedVariant}
                            </span>
                          ) : null}
                          <span className="pdp-review-date">{formatReviewDateTime(review.createdAt)}</span>
                        </div>
                      </div>
                      <p className="pdp-review-content">{review.content}</p>
                      {review.images && review.images.length > 0 ? (
                        <div className="pdp-review-images">
                          {review.images.map((imageUrl, index) => (
                            <button
                              key={`${review.id}-image-${index}`}
                              type="button"
                              className="pdp-review-image-link"
                              onClick={() =>
                                setSelectedReviewImage({
                                  url: imageUrl,
                                  alt: `Ảnh đánh giá ${index + 1}`,
                                })
                              }
                            >
                              <img src={imageUrl} alt={`Ảnh đánh giá ${index + 1}`} className="pdp-review-image" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {review.shopReply ? (
                        <div className="pdp-review-reply">
                          <div className="pdp-review-reply-head">
                            <span className="pdp-review-reply-title">Phản hồi của Người Bán</span>
                            <span className="pdp-review-reply-time">{formatReviewDateTime(review.shopReply.createdAt)}</span>
                          </div>
                          <p className="pdp-review-reply-text">{review.shopReply.content}</p>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {selectedReviewImage ? (
            <div
              className="pdp-review-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label="Xem ảnh đánh giá"
              onClick={() => setSelectedReviewImage(null)}
            >
              <div className="pdp-review-lightbox-content" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="pdp-review-lightbox-close"
                  onClick={() => setSelectedReviewImage(null)}
                  aria-label="Đóng xem ảnh"
                >
                  <X size={18} />
                </button>
                <img
                  src={selectedReviewImage.url}
                  alt={selectedReviewImage.alt}
                  className="pdp-review-lightbox-image"
                />
              </div>
            </div>
          ) : null}

        </div>
      </div>

      {isReportModalOpen && product?.backendId && (
        <ReportProductModal
          productId={product.backendId}
          productName={product.name}
          onClose={() => setIsReportModalOpen(false)}
          onSuccess={() => {
            setIsReportModalOpen(false);
            setHasReportedLocally(true);
          }}
        />
      )}
    </div>
  );
};

export default ProductDetail;


