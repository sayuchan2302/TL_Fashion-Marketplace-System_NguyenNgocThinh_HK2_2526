export type AnalyticsBucket = 'DAY' | 'WEEK' | 'MONTH';

export interface AnalyticsRangeQuery {
  from: string;
  to: string;
  bucket: AnalyticsBucket;
}

export interface AnalyticsSummary {
  grossRevenue: number;
  payout: number;
  commission: number;
  netRevenue: number;
  deliveredOrders: number;
  averageOrderValue: number;
  distinctCustomers: number;
}

export interface AnalyticsMetricChange {
  absolute: number;
  percent: number | null;
}

export interface AnalyticsChanges {
  grossRevenue: AnalyticsMetricChange;
  payout: AnalyticsMetricChange;
  commission: AnalyticsMetricChange;
  netRevenue: AnalyticsMetricChange;
  deliveredOrders: AnalyticsMetricChange;
  averageOrderValue: AnalyticsMetricChange;
  distinctCustomers: AnalyticsMetricChange;
}

export interface AnalyticsSeriesPoint {
  label: string;
  from: string;
  to: string;
  grossRevenue: number;
  payout: number;
  commission: number;
  netRevenue: number;
  deliveredOrders: number;
}

export interface AnalyticsRangeData {
  from: string;
  to: string;
  bucket: AnalyticsBucket;
  summary: AnalyticsSummary;
  previous: AnalyticsSummary;
  changes: AnalyticsChanges;
  series: AnalyticsSeriesPoint[];
}
