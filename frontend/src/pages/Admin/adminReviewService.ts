import { apiRequest } from '../../services/apiClient';

export type ReviewStatus = 'visible' | 'hidden';

export interface Review {
  id: string;
  storeId: string;
  productId: string;
  productSlug?: string;
  productName: string;
  productImage: string;
  customerName: string;
  customerEmail: string;
  rating: number;
  content: string;
  date: string;
  status: ReviewStatus;
  reply: string | null;
  replyAt?: string | null;
  images?: string[];
  orderId?: string;
  orderCode?: string;
  version: number;
}

export interface PaginatedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

interface BackendReview extends Omit<Review, 'status'> {
  status?: string | null;
  productSlug?: string;
}

const normalizeReviewStatus = (status?: string | null): ReviewStatus => {
  const normalized = status?.toLowerCase();
  if (normalized === 'hidden') return 'hidden';
  return 'visible';
};

const mapBackendReview = (review: BackendReview): Review => ({
  ...review,
  status: normalizeReviewStatus(review.status),
});

export const adminReviewService = {
  getAll: async (params: { page?: number; size?: number; status?: 'all' | ReviewStatus } = {}): Promise<PaginatedResponse<Review>> => {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.size !== undefined) query.set('size', String(params.size));
    if (params.status === 'hidden') query.set('status', 'HIDDEN');

    const qs = query.toString();
    const response = await apiRequest<PaginatedResponse<BackendReview>>(
      `/api/reviews/admin/all${qs ? `?${qs}` : ''}`,
      {},
      { auth: true },
    );

    return {
      ...response,
      content: (response.content || []).map(mapBackendReview),
    };
  },

  hide: async (id: string): Promise<Review> => {
    const response = await apiRequest<BackendReview>(
      `/api/reviews/admin/${id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'HIDDEN' }),
      },
      { auth: true },
    );
    return mapBackendReview(response);
  },

  addReply: async (id: string, reply: string): Promise<Review> => {
    const response = await apiRequest<BackendReview>(
      `/api/reviews/admin/${id}/reply`,
      {
        method: 'POST',
        body: JSON.stringify({ reply }),
      },
      { auth: true },
    );
    return mapBackendReview(response);
  },

  delete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/api/reviews/admin/${id}`, { method: 'DELETE' }, { auth: true });
  },
};
