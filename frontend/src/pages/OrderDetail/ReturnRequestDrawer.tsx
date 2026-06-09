import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import { Camera, Check, Loader2, X } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import {
  returnService,
  type ReturnAdditionalEvidenceRequest,
  type ReturnReason,
  type ReturnRequest,
  type ReturnResolution,
} from '../../services/returnService';
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
  activeReturnRequest?: ReturnRequest | null;
  additionalEvidenceRequest?: ReturnAdditionalEvidenceRequest;
  onAdditionalEvidenceSubmitted?: (request: ReturnRequest) => void | Promise<void>;
}

const reasonOptions: Array<{ id: ReturnReason; label: string }> = [
  { id: 'SIZE', label: t.info.reasons.size },
  { id: 'DEFECT', label: t.info.reasons.defect },
  { id: 'CHANGE', label: t.info.reasons.change },
  { id: 'OTHER', label: t.info.reasons.other },
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

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const resolveEvidenceUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:image/') || url.startsWith('blob:')) {
    return url;
  }
  return API_BASE ? `${API_BASE}${url.startsWith('/') ? url : `/${url}`}` : url;
};

const ReturnRequestDrawer = ({
  isOpen,
  order,
  onClose,
  activeReturnRequest,
  additionalEvidenceRequest,
  onAdditionalEvidenceSubmitted,
}: ReturnRequestDrawerProps) => {
  const { addToast } = useToast();
  const [items, setItems] = useState<ReturnSelectableItem[]>([]);
  const [reason, setReason] = useState<ReturnReason>('SIZE');
  const [resolution, setResolution] = useState<ReturnResolution>('REFUND');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<EvidenceState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const evidenceRef = useRef<EvidenceState | null>(null);
  const lastInitializedOrderIdRef = useRef<string | null>(null);
  const isAdditionalEvidenceMode = Boolean(activeReturnRequest && additionalEvidenceRequest);

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

    const initializeKey = `${order.id}:${additionalEvidenceRequest?.id || 'new-return'}`;
    if (lastInitializedOrderIdRef.current === initializeKey) return;
    lastInitializedOrderIdRef.current = initializeKey;

    setItems(order.items.map((item) => ({ ...item, selected: true })));
    setReason('SIZE');
    setResolution('REFUND');
    setNote('');
    setEvidence((prev) => {
      revokeEvidencePreview(prev);
      return null;
    });
  }, [additionalEvidenceRequest?.id, isOpen, order]);

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

  const handleSubmitAdditionalEvidence = async () => {
    if (!activeReturnRequest || !additionalEvidenceRequest) return;

    const normalizedNote = note.trim();
    if (!normalizedNote) {
      addToast('Vui lòng nhập nội dung bổ sung cho admin.', 'error');
      return;
    }

    if (hasUploadingEvidence) {
      addToast('Vui lòng chờ tải xong ảnh bổ sung trước khi gửi.', 'error');
      return;
    }

    if (hasEvidenceError) {
      addToast('Vui lòng xóa hoặc tải lại ảnh bổ sung bị lỗi trước khi gửi.', 'error');
      return;
    }

    if (!evidence?.uploadedUrl) {
      addToast('Vui lòng tải lên ảnh bằng chứng bổ sung.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await returnService.submitAdditionalEvidence(
        activeReturnRequest.id,
        additionalEvidenceRequest.id,
        normalizedNote,
        evidence.uploadedUrl,
      );
      await onAdditionalEvidenceSubmitted?.(updated);
      addToast('Đã gửi bằng chứng bổ sung cho admin.', 'success');
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'Không thể gửi bằng chứng bổ sung.';
      addToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (isAdditionalEvidenceMode) {
      await handleSubmitAdditionalEvidence();
      return;
    }

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

    if (!evidence?.uploadedUrl) {
      addToast('Vui lòng tải lên ảnh minh chứng đổi trả.', 'error');
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
  const submitLabel = isAdditionalEvidenceMode
    ? (isSubmitting ? 'Đang gửi...' : 'Gửi bằng chứng bổ sung')
    : (isSubmitting ? 'Đang gửi...' : t.summary.submit);

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
            <p className="return-drawer-eyebrow">{isAdditionalEvidenceMode ? 'Bổ sung bằng chứng' : 'Hoàn đơn'}</p>
            <h3 className="return-drawer-title">
              {isAdditionalEvidenceMode ? 'Cung cấp thêm bằng chứng' : 'Yêu cầu'} cho đơn #{toDisplayOrderCode(order.code || order.id)}
            </h3>
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
              <h4>{isAdditionalEvidenceMode ? 'Sản phẩm đang tranh chấp' : 'Sản phẩm cần xử lý'}</h4>
              <span>Toàn bộ đơn hàng</span>
            </div>

            <div className="return-item-list">
              {items.map((item, index) => (
                <article key={`${item.id}-${index}`} className={`return-item-card ${item.selected ? 'selected' : ''}`}>
                  <div className="return-item-main" style={{ gridTemplateColumns: '58px minmax(0, 1fr)' }}>
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
                  </div>
                </article>
              ))}
            </div>
          </section>

          {isAdditionalEvidenceMode && additionalEvidenceRequest ? (
            <section className="return-drawer-section return-additional-evidence-panel">
              <h4>Admin yêu cầu bổ sung</h4>
              <div className="return-admin-request-box">
                <p>{additionalEvidenceRequest.message}</p>
                {additionalEvidenceRequest.requestedAt ? (
                  <small>Thời gian yêu cầu: {new Date(additionalEvidenceRequest.requestedAt).toLocaleString('vi-VN')}</small>
                ) : null}
              </div>
              {additionalEvidenceRequest.evidence?.length > 0 ? (
                <div className="return-additional-evidence-list">
                  {additionalEvidenceRequest.evidence.map((item) => (
                    <article key={item.id} className="return-additional-evidence-item">
                      <img src={resolveEvidenceUrl(item.evidenceUrl)} alt="Bằng chứng đã gửi" />
                      <div>
                        <strong>{item.submittedByRole === 'CUSTOMER' ? 'Customer' : 'Vendor'}</strong>
                        <p>{item.note}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="return-additional-evidence-empty">Chưa có bên nào gửi bằng chứng bổ sung cho yêu cầu này.</p>
              )}
            </section>
          ) : (
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
          )}

          <section className="return-drawer-section">
            <label className="return-drawer-label" htmlFor="return-drawer-evidence">
              {isAdditionalEvidenceMode ? 'Ảnh bằng chứng bổ sung' : 'Ảnh minh chứng'}
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
                  <img src={resolveEvidenceUrl(evidencePreviewUrl)} alt={isAdditionalEvidenceMode ? 'Ảnh bằng chứng bổ sung' : 'Ảnh minh chứng đổi/trả'} />
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
              placeholder={isAdditionalEvidenceMode ? 'Nhập nội dung giải thích thêm cho admin...' : t.info.descriptionPlaceholder}
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
            {submitLabel}
          </button>
        </div>
      </form>
    </>
  );
};

export default ReturnRequestDrawer;
