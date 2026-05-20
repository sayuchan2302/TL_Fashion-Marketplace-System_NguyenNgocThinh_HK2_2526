import { apiRequest } from './apiClient';

export type ReturnStatus =
  | 'PENDING_VENDOR'
  | 'ACCEPTED'
  | 'SHIPPING'
  | 'RECEIVED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'DISPUTED'
  | 'CANCELLED';
export type ReturnReason = 'SIZE' | 'DEFECT' | 'CHANGE' | 'OTHER';
export type ReturnResolution = 'EXCHANGE' | 'REFUND';
export type AdminVerdictAction = 'REFUND_TO_CUSTOMER' | 'RELEASE_TO_VENDOR';

export interface ReturnItem {
  orderItemId: string;
  productName: string;
  variantName?: string;
  imageUrl?: string;
  evidenceUrl?: string;
  quantity: number;
  unitPrice: number;
}

export interface ReturnRequest {
  id: string;
  code?: string;
  orderId: string;
  orderCode?: string;
  userId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  reason: ReturnReason;
  note?: string;
  resolution: ReturnResolution;
  status: ReturnStatus;
  items: ReturnItem[];
  refundAmount?: number;
  storeId?: string;
  storeName?: string;
  vendorReason?: string;
  disputeReason?: string;
  shippingTrackingNumber?: string;
  shippingCarrier?: string;
  adminNote?: string;
  updatedBy?: string;
  shippedAt?: string;
  receivedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReturnSubmitPayload {
  orderId: string;
  reason: ReturnReason;
  note?: string;
  resolution: ReturnResolution;
  items: Array<{ orderItemId: string; quantity?: number; evidenceUrl?: string }>;
}

export interface ReturnListResponse {
  content: ReturnRequest[];
  totalElements: number;
  totalPages: number;
  number: number;
}

export interface VendorReturnSummary {
  all: number;
  needsAction: number;
  inTransit: number;
  toInspect: number;
  disputed: number;
}

interface ReturnListParams {
  status?: ReturnStatus;
  statuses?: ReturnStatus[];
  q?: string;
  page?: number;
  size?: number;
}

interface BackendUploadImageResponse {
  url?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const returnService = {
  async submit(payload: ReturnSubmitPayload): Promise<ReturnRequest> {
    return apiRequest<ReturnRequest>('/api/returns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { auth: true });
  },

  async getByOrderId(orderId: string): Promise<ReturnRequest[]> {
    return apiRequest<ReturnRequest[]>(`/api/returns/order/${orderId}`, {}, { auth: true });
  },

  async listCustomerReturns(): Promise<ReturnRequest[]> {
    return apiRequest<ReturnRequest[]>('/api/returns/customer', {}, { auth: true });
  },

  async listAdmin(params: ReturnListParams = {}): Promise<ReturnListResponse> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.statuses && params.statuses.length > 0) {
      params.statuses.forEach((status) => query.append('statuses', status));
    }
    if (params.q && params.q.trim()) query.set('q', params.q.trim());
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.size !== undefined) query.set('size', String(params.size));
    const qs = query.toString();
    return apiRequest<ReturnListResponse>(`/api/returns${qs ? `?${qs}` : ''}`, {}, { auth: true });
  },

  async listVendor(params: ReturnListParams = {}): Promise<ReturnListResponse> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.statuses && params.statuses.length > 0) {
      params.statuses.forEach((status) => query.append('statuses', status));
    }
    if (params.q && params.q.trim()) query.set('q', params.q.trim());
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.size !== undefined) query.set('size', String(params.size));
    const qs = query.toString();
    return apiRequest<ReturnListResponse>(`/api/returns/my-store${qs ? `?${qs}` : ''}`, {}, { auth: true });
  },

  async getVendorSummary(): Promise<VendorReturnSummary> {
    return apiRequest<VendorReturnSummary>('/api/returns/my-store/summary', {}, { auth: true });
  },

  async getAdminByIdentifier(identifier: string): Promise<ReturnRequest> {
    const normalized = String(identifier || '').trim();
    const path = UUID_PATTERN.test(normalized)
      ? `/api/returns/${normalized}`
      : `/api/returns/code/${encodeURIComponent(normalized)}`;
    return apiRequest<ReturnRequest>(path, {}, { auth: true });
  },

  async getAdmin(id: string): Promise<ReturnRequest> {
    return this.getAdminByIdentifier(id);
  },

  async markShipping(id: string, trackingNumber: string, carrier: string): Promise<ReturnRequest> {
    return apiRequest<ReturnRequest>(`/api/returns/${id}/shipping`, {
      method: 'PATCH',
      body: JSON.stringify({ trackingNumber, carrier }),
    }, { auth: true });
  },

  async openDispute(id: string, reason: string): Promise<ReturnRequest> {
    return apiRequest<ReturnRequest>(`/api/returns/${id}/dispute`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }, { auth: true });
  },

  async cancelByCustomer(id: string, reason?: string): Promise<ReturnRequest> {
    return apiRequest<ReturnRequest>(`/api/returns/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }, { auth: true });
  },

  async acceptByVendor(id: string): Promise<ReturnRequest> {
    return apiRequest<ReturnRequest>(`/api/returns/my-store/${id}/accept`, {
      method: 'PATCH',
    }, { auth: true });
  },

  async rejectByVendor(id: string, reason: string): Promise<ReturnRequest> {
    return apiRequest<ReturnRequest>(`/api/returns/my-store/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }, { auth: true });
  },

  async markReceivedByVendor(id: string): Promise<ReturnRequest> {
    return apiRequest<ReturnRequest>(`/api/returns/my-store/${id}/received`, {
      method: 'PATCH',
    }, { auth: true });
  },

  async confirmRefundByVendor(id: string): Promise<ReturnRequest> {
    return apiRequest<ReturnRequest>(`/api/returns/my-store/${id}/confirm-refund`, {
      method: 'PATCH',
    }, { auth: true });
  },

  async adminFinalVerdict(id: string, action: AdminVerdictAction, adminNote?: string): Promise<ReturnRequest> {
    return apiRequest<ReturnRequest>(`/api/returns/admin/${id}/verdict`, {
      method: 'PATCH',
      body: JSON.stringify({ action, adminNote }),
    }, { auth: true });
  },

  async uploadEvidence(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiRequest<BackendUploadImageResponse>(
      '/api/returns/upload-evidence',
      {
        method: 'POST',
        body: formData,
      },
      { auth: true },
    );

    const nextUrl = String(response?.url || '').trim();
    if (!nextUrl) {
      throw new Error('Không nhận được URL evidence sau khi tải lên.');
    }
    return nextUrl;
  },
};
