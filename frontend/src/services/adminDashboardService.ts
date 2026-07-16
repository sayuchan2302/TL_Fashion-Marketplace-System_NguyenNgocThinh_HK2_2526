import { apiRequest } from './apiClient';
import type { AnalyticsRangeData, AnalyticsRangeQuery } from './analyticsTypes';

export interface AdminDashboardMetrics {
  gmvDelivered: number;
  commissionDelivered: number;
  totalOrders: number;
  pendingStoreApprovals: number;
  lockedUsers: number;
  totalCustomers: number;
  runningCampaigns: number;
  totalStores: number;
}

export interface AdminDashboardQuickViews {
  pendingStoreApprovals: number;
  categoriesNeedReview: number;
  parentOrdersNeedAttention: number;
  pendingReturns: number;
}

export interface AdminDashboardTrendPoint {
  date: string;
  gmv: number;
  commission: number;
}

export interface AdminDashboardParentOrder {
  id: string;
  code?: string;
  customerName: string;
  total: number;
  issue: string;
  priority: 'high' | 'medium' | 'low';
  waitMinutes: number;
}

export interface AdminDashboardTopCategory {
  categoryId: string;
  name: string;
  image?: string | null;
  productCount: number;
  signal: string;
}

export interface AdminDashboardResponse {
  metrics: AdminDashboardMetrics;
  quickViews: AdminDashboardQuickViews;
  trend: AdminDashboardTrendPoint[];
  parentOrders: AdminDashboardParentOrder[];
  topCategories: AdminDashboardTopCategory[];
  analytics?: AnalyticsRangeData;
}

export const adminDashboardService = {
  async get(query?: AnalyticsRangeQuery): Promise<AdminDashboardResponse> {
    const searchParams = new URLSearchParams();
    if (query) {
      searchParams.set('from', query.from);
      searchParams.set('to', query.to);
      searchParams.set('bucket', query.bucket);
    }
    const queryString = searchParams.toString();
    return apiRequest<AdminDashboardResponse>(
      `/api/admin/dashboard${queryString ? `?${queryString}` : ''}`,
      {},
      { auth: true },
    );
  },
};
