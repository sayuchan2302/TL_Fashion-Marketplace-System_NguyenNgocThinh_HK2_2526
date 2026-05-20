import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import { Camera, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { returnService, type ReturnReason, type ReturnResolution } from '../../services/returnService';
import type { Order, OrderItem } from '../../types';
import { formatPrice } from '../../utils/formatters';
import { getOptimizedImageUrl } from '../../utils/getOptimizedImageUrl';
import { toDisplayOrderCode } from '../../utils/displayCode';
import { CLIENT_TEXT } from '../../utils/texts';

const t = CLIENT_TEXT.returns;
const MAX_EVIDENCE_SIZE = 5 * 1024 * 1024;

type ReturnSelectableItem = OrderItem & { selected: boolean };

interface EvidenceState {
  uploadedUrl?: string;
  previewUrl?: string;
  isUploading?: boolean;
  error?: string;
}

interface ReturnRequestDrawerProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
}

const reasonOptions: Array<{ id: ReturnReason; label: string }> = [
  { id: 'SIZE', label: t.info.reasons.size },
  { id: 'DEFECT', label: t.info.reasons.defect },
  { id: 'CHANGE', label: t.info.reasons.change },
  { id: 'OTHER', label: t.info.reasons.other },
];

const resolutionOptions: Array<{ id: ReturnResolution; label: string; description: string }> = [
  { id: 'EXCHANGE', label: t.resolution.changeSize, description: t.resolution.changeSizeDesc },
  { id: 'REFUND', label: t.resolution.refund, description: t.resolution.refundDesc },
];

const getItemVariantLabel = (item: OrderItem) =>
  [
    item.color ? `Màu: ${item.color}` : '',
    item.size ? `Size: ${item.size}` : '',
  ].filter(Boolean).join(' | ') || 'Sản phẩm đã giao';

const revokeEvidencePreview = (record: EvidenceState | null) => {
  if (record?.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(record.previewUrl);
  }
};

const ReturnRequestDrawer = ({ isOpen, order, onClose }: ReturnRequestDrawerProps) => {
  const { addToast } = useToast();
  const [items, setItems] = useState<ReturnSelectableItem[]>([]);
  const [reason, setReason] = useState<ReturnReason>('SIZE');
  const [resolution, setResolution] = useState<ReturnResolution>('EXCHANGE');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<EvidenceState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const evidenceRef = useRef<EvidenceState | null>(null);
  const lastInitializedOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    evidenceRef.current = evidence;
  }, [evidence]);

  useEffect(() => () => revokeEvidencePreview(evidenceRef.current), []);

  useEffect(() => {
    if (isOpen) return;

    lastInitializedOrderIdRef.current = null;
    setEvidence((prev) => {
      if (!prev) return prev;
      revokeEvidencePreview(prev);
      return null;
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !order) {
      lastInitializedOrderIdRef.current = null;
      return;
    }

    if (lastInitializedOrderIdRef.current === order.id) return;
    lastInitializedOrderIdRef.current = order.id;

    setItems(order.items.map((item) => ({ ...item, selected: true })));
    setReason('SIZE');
    setResolution('EXCHANGE');
    setNote('');
    setEvidence((prev) => {
      revokeEvidencePreview(prev);
      return null;
    });
  }, [isOpen, order]);

  const selectedItems = useMemo(() => items.filter((item) => item.selected), [items]);

  const hasUploadingEvidence = useMemo(
    () => Boolean(evidence?.isUploading),
    [evidence],
  );

  const hasEvidenceError = useMemo(
    () => Boolean(evidence?.error),
    [evidence],
  );

  if (!isOpen || !order) return null;

  const toggleItem = (itemId: string) => {
    setItems((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, selected: !item.selected } : item
    )));
  };

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleEvidenceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.toLowerCase().startsWith('image/')) {
      addToast('Chỉ chấp nhận file hình ảnh cho minh chứng đổi trả.', 'error');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_EVIDENCE_SIZE) {
      addToast('Ảnh minh chứng vượt quá 5MB.', 'error');
      event.target.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    setEvidence((prev) => {
      revokeEvidencePreview(prev);
      return {
        previewUrl,
        isUploading: true,
        error: '',
      };
    });

    try {
      const evidenceUrl = await returnService.uploadEvidence(file);
      setEvidence((current) => {
        if (!current || current.previewUrl !== previewUrl) return current;

        return {
          ...current,
          uploadedUrl: evidenceUrl,
          isUploading: false,
          error: '',
        };
      });
      addToast('Đã tải ảnh minh chứng.', 'success');
    } catch (error: unknown) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'Tải ảnh minh chứng thất bại.';
      setEvidence((current) => {
        if (!current || current.previewUrl !== previewUrl) return current;

        return {
          ...current,
          isUploading: false,
          error: message,
        };
      });
      addToast(message, 'error');
    } finally {
      event.target.value = '';
    }
  };

  const removeEvidence = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    setEvidence((prev) => {
      revokeEvidencePreview(prev);
      return null;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (selectedItems.length === 0) {
      addToast(t.validation.selectOne, 'error');
      return;
    }

    if (hasUploadingEvidence) {
      addToast('Vui lòng chờ tải xong ảnh minh chứng trước khi gửi yêu cầu.', 'error');
      return;
    }

    if (hasEvidenceError) {
      addToast('Vui lòng xóa hoặc tải lại ảnh minh chứng bị lỗi trước khi gửi yêu cầu.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await returnService.submit({
        orderId: order.id,
        reason,
        resolution,
        note: note.trim(),
        items: selectedItems.map((item) => ({
          orderItemId: item.id,
          quantity: item.quantity || 1,
          evidenceUrl: evidence?.uploadedUrl || undefined,
        })),
      });

      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'Tạo yêu cầu đổi trả thất bại.';
      addToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const evidencePreviewUrl = evidence?.previewUrl || evidence?.uploadedUrl;
  const isEvidenceUploading = Boolean(evidence?.isUploading);
  const evidenceError = evidence?.error;

  return (
    <>
      <button
        type="button"
        className="return-drawer-overlay"
        onClick={handleClose}
        aria-label="Đóng yêu cầu đổi trả"
      />
      <form className="return-drawer" onSubmit={handleSubmit}>
        <div className="return-drawer-header">
          <div>
            <p className="return-drawer-eyebrow">Đổi / trả hàng</p>
            <h3 className="return-drawer-title">Yêu cầu cho đơn #{toDisplayOrderCode(order.code || order.id)}</h3>
          </div>
          <button type="button" className="return-drawer-close" onClick={handleClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="return-drawer-body">
          <div className="return-drawer-order-card">
            <div>
              <span className="return-drawer-muted">Ngày đặt</span>
              <strong>{new Date(order.createdAt).toLocaleDateString('vi-VN')}</strong>
            </div>
            <div>
              <span className="return-drawer-muted">Tổng tiền</span>
              <strong>{formatPrice(order.total)}</strong>
            </div>
            <div>
              <span className="return-drawer-muted">Sản phẩm</span>
              <strong>{order.items.length}</strong>
            </div>
          </div>

          <section className="return-drawer-section">
            <div className="return-drawer-section-head">
              <h4>Sản phẩm cần xử lý</h4>
              <span>{selectedItems.length}/{items.length} đã chọn</span>
            </div>

            <div className="return-item-list">
              {items.map((item, index) => (
                <article key={`${item.id}-${index}`} className={`return-item-card ${item.selected ? 'selected' : ''}`}>
                  <label className="return-item-main">
                    <input
                      type="checkbox"
                      className="return-item-check"
                      checked={item.selected}
                      onChange={() => toggleItem(item.id)}
                    />
                    <img
                      src={getOptimizedImageUrl(item.image, { width: 160, format: 'webp' })}
                      alt={item.name}
                      className="return-item-img"
                    />
                    <span className="return-item-copy">
                      <strong>{item.name}</strong>
                      <small>{getItemVariantLabel(item)}</small>
                      <small>Số lượng: {item.quantity || 1}</small>
                    </span>
                  </label>
                </article>
              ))}
            </div>
          </section>

          <section className="return-drawer-section">
            <h4>{t.info.reason}</h4>
            <div className="return-chip-grid">
              {reasonOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`return-chip ${reason === option.id ? 'active' : ''}`}
                  onClick={() => setReason(option.id)}
                >
                  {reason === option.id ? <Check size={14} /> : null}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="return-drawer-section">
            <h4>{t.resolution.title}</h4>
            <div className="return-resolution-grid">
              {resolutionOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`return-resolution-card ${resolution === option.id ? 'active' : ''}`}
                  onClick={() => setResolution(option.id)}
                >
                  <span>
                    {resolution === option.id ? <Check size={14} /> : <RefreshCw size={14} />}
                    {option.label}
                  </span>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="return-drawer-section">
            <label className="return-drawer-label" htmlFor="return-drawer-evidence">
              Ảnh minh chứng
            </label>
            <div className="return-evidence-upload">
              <input
                ref={fileInputRef}
                id="return-drawer-evidence"
                type="file"
                accept="image/*"
                onChange={(event) => void handleEvidenceUpload(event)}
                hidden
              />
              {evidencePreviewUrl ? (
                <div className={`return-evidence-preview ${isEvidenceUploading ? 'uploading' : ''}`}>
                  <img src={evidencePreviewUrl} alt="Ảnh minh chứng đổi/trả" />
                  {isEvidenceUploading ? <span className="return-evidence-status">Đang tải</span> : null}
                  <button
                    type="button"
                    className="return-evidence-remove"
                    onClick={removeEvidence}
                    aria-label="Xóa ảnh minh chứng"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="return-evidence-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isEvidenceUploading}
              >
                {isEvidenceUploading ? <Loader2 size={24} className="return-spin" /> : <Camera size={24} />}
                <span>{isEvidenceUploading ? 'Đang tải...' : evidencePreviewUrl ? 'Đổi ảnh' : 'Thêm ảnh'}</span>
              </button>
            </div>
            {evidenceError ? <p className="return-evidence-error">{evidenceError}</p> : null}
          </section>

          <section className="return-drawer-section">
            <label className="return-drawer-label" htmlFor="return-note">
              {t.info.description}
            </label>
            <textarea
              id="return-note"
              className="return-drawer-textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t.info.descriptionPlaceholder}
              maxLength={700}
              rows={5}
            />
            <span className="return-char-count">{note.length}/700</span>
          </section>
        </div>

        <div className="return-drawer-actions">
          <button type="button" className="return-btn-cancel" onClick={handleClose}>
            Hủy
          </button>
          <button type="submit" className="return-btn-submit" disabled={isSubmitting || hasUploadingEvidence}>
            {isSubmitting ? 'Đang gửi...' : t.summary.submit}
          </button>
        </div>
      </form>
    </>
  );
};

export default ReturnRequestDrawer;
