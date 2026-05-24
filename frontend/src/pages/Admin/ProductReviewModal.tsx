import { Ban, CheckCircle2 } from 'lucide-react';
import Drawer from '../../components/Drawer/Drawer';
import type { AdminModerationProduct } from './adminProductModerationService';
import {
  PanelDrawerHeader,
  PanelDrawerSection,
  PanelDrawerFooter
} from '../../components/Panel/PanelPrimitives';

interface ProductReviewModalProps {
  open: boolean;
  product: AdminModerationProduct | null;
  onClose: () => void;
  onBlock: (product: AdminModerationProduct) => void;
  onUnblock: (product: AdminModerationProduct) => Promise<void> | void;
  loading?: boolean;
}

const ProductReviewModal = ({ open, product, onClose, onBlock, onUnblock, loading = false }: ProductReviewModalProps) => {
  if (!open || !product) return null;

  const isBlocked = product.approvalStatus === 'BANNED';
  const previewImages = product.images && product.images.length > 0
    ? product.images
    : (product.thumbnail ? [product.thumbnail] : []);
  const createdAt = product.createdAt ? new Date(product.createdAt).toLocaleString('vi-VN') : 'N/A';
  const updatedAt = product.updatedAt ? new Date(product.updatedAt).toLocaleString('vi-VN') : 'N/A';
  const price = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(product.price) ? product.price : 0);

  const handleBlock = () => {
    onBlock(product);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      className="moderation-review-drawer"
      size="xl"
      ariaLabel="Rà soát sản phẩm"
    >
      <PanelDrawerHeader
        eyebrow="Quản lý sản phẩm"
        title={product.productCode}
        onClose={onClose}
        closeLabel="Đóng chi tiết sản phẩm"
      />

      <div className="drawer-body">
        <PanelDrawerSection title="Tổng quan sản phẩm">
          <div className="review-drawer-product">
            <img
              src={product.thumbnail || previewImages[0] || ''}
              alt={product.name}
              className="review-drawer-product-image"
            />
            <div className="review-drawer-product-copy">
              <p className="review-drawer-product-name">{product.name}</p>
              <p className="review-drawer-product-sub">Gian hàng: <strong>{product.storeName || 'N/A'}</strong></p>
              <div className="review-drawer-pill-row">
                <span className={`admin-pill ${product.productStatus === 'ACTIVE' ? 'success' : 'neutral'}`}>
                  {product.productStatus === 'ACTIVE' ? 'Đang bán' : product.productStatus || 'Chưa có'}
                </span>
                <span className={`admin-pill ${isBlocked ? 'danger' : 'success'}`}>
                  {isBlocked ? 'Đã chặn' : 'Đang hiển thị'}
                </span>
              </div>
            </div>
          </div>
        </PanelDrawerSection>

        <PanelDrawerSection title="Thông tin chi tiết">
          <div className="review-drawer-meta-grid">
            <div className="review-drawer-meta-card">
              <span className="review-drawer-meta-label">Mã sản phẩm</span>
              <span className="review-drawer-meta-value review-drawer-code">{product.productCode}</span>
            </div>
            <div className="review-drawer-meta-card">
              <span className="review-drawer-meta-label">Gian hàng</span>
              <span className="review-drawer-meta-value"><strong>{product.storeName || 'N/A'}</strong></span>
            </div>
            <div className="review-drawer-meta-card">
              <span className="review-drawer-meta-label">Danh mục</span>
              <span className="review-drawer-meta-value"><strong>{product.categoryName || 'N/A'}</strong></span>
            </div>
            <div className="review-drawer-meta-card">
              <span className="review-drawer-meta-label">Giá bán</span>
              <span className="review-drawer-meta-value" style={{ color: '#0d9488', fontWeight: 700 }}>{price}</span>
            </div>
            <div className="review-drawer-meta-card">
              <span className="review-drawer-meta-label">Tồn kho / Doanh số</span>
              <span className="review-drawer-meta-value review-drawer-stacked">
                <strong>{product.stock.toLocaleString('vi-VN')} chiếc</strong>
                <small>Đã bán {product.sales.toLocaleString('vi-VN')}</small>
              </span>
            </div>
            <div className="review-drawer-meta-card">
              <span className="review-drawer-meta-label">Ngày đăng bán</span>
              <span className="review-drawer-meta-value">{createdAt}</span>
            </div>
            <div className="review-drawer-meta-card" style={{ gridColumn: 'span 2' }}>
              <span className="review-drawer-meta-label">Cập nhật gần nhất</span>
              <span className="review-drawer-meta-value">{updatedAt}</span>
            </div>
          </div>
        </PanelDrawerSection>

        <div className="review-drawer-meta-grid" style={{ gap: '20px', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
          <PanelDrawerSection title="Mô tả từ vendor">
            <div className="report-drawer-note" style={{ marginTop: 0, padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <p className="review-drawer-content" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#334155' }}>
                {product.description?.trim() || 'Vendor chưa cập nhật mô tả sản phẩm.'}
              </p>
            </div>
          </PanelDrawerSection>

          <PanelDrawerSection title="Hình ảnh sản phẩm">
            {previewImages.length === 0 ? (
              <p className="admin-muted small">Chưa có ảnh để rà soát.</p>
            ) : (
              <div className="review-drawer-media-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
                {previewImages.map((image, index) => (
                  <a
                    key={`${product.id}-${index}`}
                    href={image}
                    target="_blank"
                    rel="noreferrer"
                    className="review-drawer-media-item"
                    style={{ borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'block', aspectRatio: '1/1' }}
                  >
                    <img src={image} alt={`${product.name}-${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </a>
                ))}
              </div>
            )}
          </PanelDrawerSection>
        </div>

        {!isBlocked && (
          <PanelDrawerSection title="Chỉ dẫn nghiệp vụ">
            <p className="admin-muted small" style={{ fontStyle: 'italic' }}>
              * Rà soát hình ảnh bản quyền và nội dung mô tả trước khi thực hiện thao tác cấm. Nhấn "Chặn sản phẩm" để khai báo biên bản lý do chi tiết.
            </p>
          </PanelDrawerSection>
        )}
      </div>

      <PanelDrawerFooter>
        <button className="admin-ghost-btn" onClick={onClose} disabled={loading}>
          Đóng
        </button>
        {isBlocked ? (
          <button
            className="admin-ghost-btn"
            style={{ color: '#10b981', background: 'transparent', marginLeft: 'auto' }}
            onClick={() => {
              void onUnblock(product);
            }}
            disabled={loading}
          >
            <CheckCircle2 size={16} /> Gỡ chặn
          </button>
        ) : (
          <button
            className="admin-ghost-btn danger"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              void handleBlock();
            }}
            disabled={loading}
          >
            <Ban size={16} /> Chặn sản phẩm
          </button>
        )}
      </PanelDrawerFooter>
    </Drawer>
  );
};

export default ProductReviewModal;
