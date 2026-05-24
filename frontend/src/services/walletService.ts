import { apiRequest } from './apiClient';

export interface VendorWallet {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  storeLogo: string | null;
  availableBalance: number;
  frozenBalance: number;
  reservedBalance: number;
  totalBalance: number;
  lastUpdated: string;
}

export interface WalletTransaction {
  id: string;
  code: string;
  walletId: string;
  orderId: string | null;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

export interface PayoutRequest {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  storeLogo?: string | null;
  amount: number;
  bankAccountName: string;
  bankAccountNumber: string;
  bankName: string;
  status: string;
  adminNote: string | null;
  processedBy: string | null;
  processedAt: string | null;
  createdAt: string;
}

interface PageResponse<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number;
}

export const walletService = {
  async getMyWallet(): Promise<VendorWallet> {
    return apiRequest<VendorWallet>('/api/wallets/my-wallet', {}, { auth: true });
  },

  async getMyTransactions(page = 1, size = 20): Promise<PageResponse<WalletTransaction>> {
    return apiRequest<PageResponse<WalletTransaction>>(
      `/api/wallets/my-wallet/transactions?page=${Math.max(page - 1, 0)}&size=${size}`,
      {},
      { auth: true },
    );
  },

  async createPayoutRequest(params: {
    amount: number;
    bankAccountName: string;
    bankAccountNumber: string;
    bankName: string;
  }): Promise<PayoutRequest> {
    return apiRequest<PayoutRequest>(
      '/api/wallets/my-payout',
      {
        method: 'POST',
        body: JSON.stringify(params),
      },
      { auth: true },
    );
  },

  async getMyPayouts(page = 1, size = 20): Promise<PageResponse<PayoutRequest>> {
    return apiRequest<PageResponse<PayoutRequest>>(
      `/api/wallets/my-payouts?page=${Math.max(page - 1, 0)}&size=${size}`,
      {},
      { auth: true },
    );
  },

  async getAdminWallets(keyword = '', page = 1, size = 20): Promise<PageResponse<VendorWallet>> {
    return apiRequest<PageResponse<VendorWallet>>(
      `/api/wallets?keyword=${encodeURIComponent(keyword)}&page=${Math.max(page - 1, 0)}&size=${size}`,
      {},
      { auth: true },
    );
  },

  async getPendingPayouts(page = 1, size = 20): Promise<PageResponse<PayoutRequest>> {
    return apiRequest<PageResponse<PayoutRequest>>(
      `/api/wallets/payouts/pending?page=${Math.max(page - 1, 0)}&size=${size}`,
      {},
      { auth: true },
    );
  },

  async approvePayoutRequest(id: string): Promise<PayoutRequest> {
    return apiRequest<PayoutRequest>(
      `/api/wallets/payouts/${id}/approve`,
      { method: 'POST' },
      { auth: true },
    );
  },

  async approvePayout(id: string): Promise<PayoutRequest> {
    return apiRequest<PayoutRequest>(
      `/api/wallets/payouts/${id}/approve`,
      { method: 'POST' },
      { auth: true },
    );
  },

  async rejectPayout(id: string, note: string): Promise<PayoutRequest> {
    return apiRequest<PayoutRequest>(
      `/api/wallets/payouts/${id}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ note }),
      },
      { auth: true },
    );
  },

  async getPayoutSummary(): Promise<{ pendingCount: number; pendingTotal: number }> {
    return apiRequest('/api/wallets/payouts/summary', {}, { auth: true });
  },
};
