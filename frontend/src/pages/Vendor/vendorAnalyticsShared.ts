import type {
  VendorAnalyticsData,
  VendorAnalyticsPeriod,
  VendorAnalyticsPeriodSnapshot,
} from '../../services/vendorPortalService';

export type VendorAnalyticsChartPoint = {
  ts: number;
  dateLabel: string;
  fullDate: string;
  revenue: number;
  payout: number;
  commission: number;
  orders: number;
};

export const emptyAnalyticsPeriodSnapshot = (): VendorAnalyticsPeriodSnapshot => ({
  revenue: 0,
  payout: 0,
  commission: 0,
  orders: 0,
  avgOrderValue: 0,
  conversionRate: 0,
  previousRevenue: 0,
  previousPayout: 0,
  previousCommission: 0,
  previousOrders: 0,
});

export const emptyVendorAnalytics: VendorAnalyticsData = {
  periods: {
    today: emptyAnalyticsPeriodSnapshot(),
    week: emptyAnalyticsPeriodSnapshot(),
    month: emptyAnalyticsPeriodSnapshot(),
    year: emptyAnalyticsPeriodSnapshot(),
  },
  dailyData: [],
  topProducts: [],
  commissionRate: 5,
  analytics: null,
};

export const vendorAnalyticsPeriodLabels: Record<VendorAnalyticsPeriod, string> = {
  week: 'Tuần',
  month: 'Tháng',
  year: 'Năm',
};

const toSafeDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getWeekStart = (date: Date) => {
  const clone = new Date(date);
  const day = (clone.getDay() + 6) % 7;
  clone.setDate(clone.getDate() - day);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const ensureRenderablePoints = (
  points: VendorAnalyticsChartPoint[],
  range: VendorAnalyticsPeriod,
): VendorAnalyticsChartPoint[] => {
  if (points.length !== 1) return points;

  const current = points[0];
  const prevDate = new Date(current.ts);

  if (range === 'year') {
    prevDate.setFullYear(prevDate.getFullYear() - 1);
  } else if (range === 'month') {
    prevDate.setMonth(prevDate.getMonth() - 1);
  } else {
    prevDate.setDate(prevDate.getDate() - 7);
  }

  const prevPoint: VendorAnalyticsChartPoint = {
    ts: prevDate.getTime(),
    dateLabel:
      range === 'year'
        ? String(prevDate.getFullYear())
        : `${String(prevDate.getMonth() + 1).padStart(2, '0')}/${prevDate.getFullYear()}`,
    fullDate:
      range === 'year'
        ? `Năm ${prevDate.getFullYear()}`
        : `Tháng ${String(prevDate.getMonth() + 1).padStart(2, '0')}/${prevDate.getFullYear()}`,
    revenue: 0,
    payout: 0,
    commission: 0,
    orders: 0,
  };

  return [prevPoint, current].sort((a, b) => a.ts - b.ts);
};

export const buildVendorAnalyticsChartData = (
  dailyData: VendorAnalyticsData['dailyData'],
  range: VendorAnalyticsPeriod,
): VendorAnalyticsChartPoint[] => {
  if (!dailyData.length) return [];

  const buckets = new Map<string, VendorAnalyticsChartPoint>();

  if (range === 'week') {
    dailyData.forEach((point) => {
      const date = toSafeDate(point.date);
      if (!date) return;

      const weekStart = getWeekStart(date);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const key = weekStart.toISOString().slice(0, 10);
      const existing = buckets.get(key) || {
        ts: weekStart.getTime(),
        dateLabel: weekStart.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        fullDate: `Tuần ${weekStart.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })} - ${weekEnd.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}`,
        revenue: 0,
        payout: 0,
        commission: 0,
        orders: 0,
      };

      existing.revenue += Number(point.revenue || 0);
      existing.payout += Number(point.payout || 0);
      existing.commission += Number(point.commission || 0);
      existing.orders += Number(point.orders || 0);
      buckets.set(key, existing);
    });
  }

  if (range === 'month') {
    dailyData.forEach((point) => {
      const date = toSafeDate(point.date);
      if (!date) return;

      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const existing = buckets.get(key) || {
        ts: new Date(year, month - 1, 1).getTime(),
        dateLabel: `${String(month).padStart(2, '0')}/${year}`,
        fullDate: `Tháng ${String(month).padStart(2, '0')}/${year}`,
        revenue: 0,
        payout: 0,
        commission: 0,
        orders: 0,
      };

      existing.revenue += Number(point.revenue || 0);
      existing.payout += Number(point.payout || 0);
      existing.commission += Number(point.commission || 0);
      existing.orders += Number(point.orders || 0);
      buckets.set(key, existing);
    });
  }

  if (range === 'year') {
    dailyData.forEach((point) => {
      const date = toSafeDate(point.date);
      if (!date) return;

      const year = date.getFullYear();
      const key = String(year);
      const existing = buckets.get(key) || {
        ts: new Date(year, 0, 1).getTime(),
        dateLabel: key,
        fullDate: `Năm ${key}`,
        revenue: 0,
        payout: 0,
        commission: 0,
        orders: 0,
      };

      existing.revenue += Number(point.revenue || 0);
      existing.payout += Number(point.payout || 0);
      existing.commission += Number(point.commission || 0);
      existing.orders += Number(point.orders || 0);
      buckets.set(key, existing);
    });
  }

  const points = Array.from(buckets.values()).sort((a, b) => a.ts - b.ts);
  if (range === 'month' || range === 'year') {
    return ensureRenderablePoints(points, range);
  }

  return points;
};

export const calculateVendorAnalyticsTrend = (current: number, previous: number) => {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

export const getVendorAnalyticsChartMeta = (range: VendorAnalyticsPeriod) => {
  if (range === 'week') {
    return {
      description: 'Doanh thu gộp và thực nhận theo tuần',
      emptyLabel: 'Dữ liệu sẽ xuất hiện khi shop có đơn hàng trong các tuần gần đây.',
    };
  }

  if (range === 'month') {
    return {
      description: 'Doanh thu gộp và thực nhận theo tháng',
      emptyLabel: 'Dữ liệu sẽ xuất hiện khi shop có đơn hàng trong các tháng gần đây.',
    };
  }

  return {
    description: 'Doanh thu gộp và thực nhận theo năm',
    emptyLabel: 'Dữ liệu sẽ xuất hiện khi shop có đơn hàng trong các năm đã bán.',
  };
};
