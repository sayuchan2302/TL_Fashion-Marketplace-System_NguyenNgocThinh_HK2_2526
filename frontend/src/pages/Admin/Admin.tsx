import './Admin.css';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  ChevronRight,
  DollarSign,
  FolderTree,
  Package,
  ShieldAlert,
  Sparkles,
  Store,
  TicketPercent,
  TrendingUp,
  Users,
  WalletCards,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AdminLayout from './AdminLayout';
import { AdminStateBlock } from './AdminStateBlocks';
import DateRangeFilter from '../../components/Analytics/DateRangeFilter';
import {
  adminDashboardService,
  type AdminDashboardTopCategory,
} from '../../services/adminDashboardService';
import type { AnalyticsMetricChange } from '../../services/analyticsTypes';
import {
  getAnalyticsRangeLabel,
  getAnalyticsQueryFromSearchParams,
} from '../../components/Analytics/analyticsRange';
import { getOptimizedImageUrl } from '../../utils/getOptimizedImageUrl';

const formatCurrency = (value: number) => `${(value || 0).toLocaleString('vi-VN')} ₫`;

const formatAnalyticsChange = (change?: AnalyticsMetricChange) => {
  if (!change) return 'Hiện tại';
  if (change.percent === null) return change.absolute > 0 ? 'Mới phát sinh' : '—';
  return `${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(1)}%`;
};

const getAnalyticsChangeTone = (change?: AnalyticsMetricChange) => (
  !change || change.percent === null || change.percent >= 0 ? 'up' : 'down'
);

const buildCategoryFallbackImage = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=E2E8F0&color=334155&size=160&font-size=0.45`;

const resolveCategoryImage = (name: string, image?: string | null) => {
  const normalized = (image || '').trim();
  if (!normalized) {
    return buildCategoryFallbackImage(name);
  }
  return getOptimizedImageUrl(normalized, { width: 160, format: 'webp' }) || normalized;
};

type RevenueRange = 'week' | 'month' | 'year';

type RevenueChartPoint = {
  ts: number;
  dateLabel: string;
  fullDate: string;
  gmv: number;
  netRevenue: number;
};

type DailyRevenueBucket = {
  date: Date;
  gmv: number;
  commission: number;
};

const RANGE_DAY_COUNT: Record<Exclude<RevenueRange, 'year'>, number> = {
  week: 7,
  month: 30,
};

const startOfLocalDay = (date: Date) => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const addDays = (date: Date, days: number) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
};

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const toSafeDate = (value: string) => {
  const normalized = value.trim();
  const localDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (localDateMatch) {
    const [, year, month, day] = localDateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildDailyChartPoint = (date: Date, data?: Pick<DailyRevenueBucket, 'gmv' | 'commission'>): RevenueChartPoint => ({
  ts: date.getTime(),
  dateLabel: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
  fullDate: date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }),
  gmv: data?.gmv || 0,
  netRevenue: Math.max((data?.gmv || 0) - (data?.commission || 0), 0),
});

const buildDailyBuckets = (trend: Array<{ date: string; gmv: number; commission: number }>) => {
  const buckets = new Map<string, DailyRevenueBucket>();

  trend.forEach((point) => {
    const parsedDate = toSafeDate(point.date);
    if (!parsedDate) return;

    const date = startOfLocalDay(parsedDate);
    const key = toDateKey(date);
    const existing = buckets.get(key) || {
      date,
      gmv: 0,
      commission: 0,
    };

    existing.gmv += Number(point.gmv || 0);
    existing.commission += Number(point.commission || 0);
    buckets.set(key, existing);
  });

  return buckets;
};

const getLatestTrendDate = (buckets: Map<string, DailyRevenueBucket>) => {
  const dates = Array.from(buckets.values()).map((bucket) => bucket.date);
  return dates.reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest), dates[0]);
};

const buildChartDataByRange = (
  trend: Array<{ date: string; gmv: number; commission: number }>,
  range: RevenueRange
): RevenueChartPoint[] => {
  if (!trend.length) return [];

  const dailyBuckets = buildDailyBuckets(trend);
  if (!dailyBuckets.size) return [];

  if (range === 'week' || range === 'month') {
    const latestDate = getLatestTrendDate(dailyBuckets);
    const dayCount = RANGE_DAY_COUNT[range];
    const startDate = addDays(latestDate, -(dayCount - 1));

    return Array.from({ length: dayCount }, (_, index) => {
      const date = addDays(startDate, index);
      return buildDailyChartPoint(date, dailyBuckets.get(toDateKey(date)));
    });
  }

  const yearlyBuckets = new Map<string, { ts: number; gmv: number; commission: number }>();

  dailyBuckets.forEach((bucket) => {
    const year = String(bucket.date.getFullYear());
    const existing = yearlyBuckets.get(year) || {
      ts: new Date(Number(year), 0, 1).getTime(),
      gmv: 0,
      commission: 0,
    };
    existing.gmv += bucket.gmv;
    existing.commission += bucket.commission;
    yearlyBuckets.set(year, existing);
  });

  const points = Array.from(yearlyBuckets.entries())
    .map(([year, bucket]) => ({
      ts: bucket.ts,
      dateLabel: year,
      fullDate: `Năm ${year}`,
      gmv: bucket.gmv,
      netRevenue: Math.max(bucket.gmv - bucket.commission, 0),
    }))
    .sort((a, b) => a.ts - b.ts);

  if (points.length !== 1) return points;

  const current = points[0];
  const previousYear = String(Number(current.dateLabel) - 1);

  return [
    {
      ts: new Date(Number(previousYear), 0, 1).getTime(),
      dateLabel: previousYear,
      fullDate: `Năm ${previousYear}`,
      gmv: 0,
      netRevenue: 0,
    },
    current,
  ];
};

const formatCompactMoney = (value: number) => {
  const safeValue = Math.max(0, Number(value) || 0);

  if (safeValue >= 1000000) {
    const millions = safeValue / 1000000;
    return `${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }

  if (safeValue >= 1000) {
    return `${Math.round(safeValue / 1000)}K`;
  }

  return String(Math.round(safeValue));
};

const getYAxisMax = (points: RevenueChartPoint[]) => {
  const maxValue = Math.max(...points.flatMap((point) => [point.gmv, point.netRevenue]), 0);

  if (maxValue <= 0) return 1000000;
  if (maxValue < 1000000) return Math.ceil((maxValue * 1.25) / 100000) * 100000;

  return Math.ceil((maxValue * 1.15) / 1000000) * 1000000;
};

const Admin = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof adminDashboardService.get>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rangeQuery, setRangeQuery] = useState(() => getAnalyticsQueryFromSearchParams(searchParams));

  const loadDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const data = await adminDashboardService.get(rangeQuery);
      setDashboard(data);
    } catch (error: unknown) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'Không thể tải dữ liệu dashboard.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [rangeQuery]);

  useEffect(() => {
    setSearchParams({ from: rangeQuery.from, to: rangeQuery.to, bucket: rangeQuery.bucket }, { replace: true });
  }, [rangeQuery, setSearchParams]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const chartData = useMemo(
    () => dashboard?.analytics?.series.map((point) => ({
      ts: new Date(`${point.from}T00:00:00`).getTime(),
      dateLabel: point.label,
      fullDate: `${point.from} - ${point.to}`,
      gmv: Number(point.grossRevenue || 0),
      netRevenue: Number(point.netRevenue || 0),
    })) || buildChartDataByRange(dashboard?.trend || [], 'month'),
    [dashboard?.analytics, dashboard?.trend]
  );
  const yAxisMax = useMemo(() => getYAxisMax(chartData), [chartData]);

  const stats = useMemo(() => {
    const metrics = dashboard?.metrics;
    const summary = dashboard?.analytics?.summary;
    const changes = dashboard?.analytics?.changes;
    return [
      {
        label: 'GMV đã giao thành công',
        value: formatCurrency(Number(summary?.grossRevenue ?? metrics?.gmvDelivered ?? 0)),
        change: formatAnalyticsChange(changes?.grossRevenue),
        tone: getAnalyticsChangeTone(changes?.grossRevenue),
        icon: <DollarSign size={18} />,
        to: '/admin/financials',
      },
      {
        label: 'Commission đã ghi nhận',
        value: formatCurrency(Number(summary?.commission ?? metrics?.commissionDelivered ?? 0)),
        change: formatAnalyticsChange(changes?.commission),
        tone: getAnalyticsChangeTone(changes?.commission),
        icon: <WalletCards size={18} />,
        to: '/admin/financials',
      },
      {
        label: 'Đơn giao thành công',
        value: String(summary?.deliveredOrders ?? metrics?.totalOrders ?? 0),
        change: formatAnalyticsChange(changes?.deliveredOrders),
        tone: getAnalyticsChangeTone(changes?.deliveredOrders),
        icon: <Package size={18} />,
        to: '/admin/orders',
      },
      {
        label: 'Giá trị đơn trung bình',
        value: formatCurrency(Number(summary?.averageOrderValue || 0)),
        change: formatAnalyticsChange(changes?.averageOrderValue),
        tone: getAnalyticsChangeTone(changes?.averageOrderValue),
        icon: <Users size={18} />,
        to: '/admin/orders',
      },
      {
        label: 'Khách hàng đã mua',
        value: String(summary?.distinctCustomers ?? metrics?.totalCustomers ?? 0),
        change: formatAnalyticsChange(changes?.distinctCustomers),
        tone: getAnalyticsChangeTone(changes?.distinctCustomers),
        icon: <Users size={18} />,
        to: '/admin/users',
      },
      {
        label: 'Tổng gian hàng',
        value: String(metrics?.totalStores || 0),
        change: 'Hiện tại',
        tone: 'up',
        icon: <Store size={18} />,
        to: '/admin/stores',
      },
    ];
  }, [dashboard?.analytics, dashboard?.metrics]);

  const governanceFeed = useMemo(() => {
    const quick = dashboard?.quickViews;
    return [
      {
        id: 'gov-1',
        tone: (quick?.parentOrdersNeedAttention || 0) > 0 ? 'danger' : 'info',
        text: `${quick?.parentOrdersNeedAttention || 0} đơn hàng cha cần theo dõi SLA`,
        cta: 'Mở đơn hàng cha',
        to: '/admin/orders',
        icon: <ShieldAlert size={16} />,
      },
      {
        id: 'gov-2',
        tone: (quick?.pendingStoreApprovals || 0) > 0 ? 'warning' : 'info',
        text: `${quick?.pendingStoreApprovals || 0} gian hàng mới đang chờ duyệt`,
        cta: 'Duyệt gian hàng',
        to: '/admin/stores',
        icon: <Store size={16} />,
      },
      {
        id: 'gov-3',
        tone: (quick?.pendingReturns || 0) > 0 ? 'warning' : 'info',
        text: `${quick?.pendingReturns || 0} yêu cầu đổi trả cần điều phối`,
        cta: 'Xem đổi trả',
        to: '/admin/returns',
        icon: <WalletCards size={16} />,
      },
    ];
  }, [dashboard?.quickViews]);

  const topCategories: AdminDashboardTopCategory[] = dashboard?.topCategories || [];
  const topSignalBase = Math.max(...topCategories.map((item) => item.productCount), 1);

  type DashboardTooltipEntry = {
    name: string;
    value: number;
    color: string;
    payload: {
      fullDate: string;
    };
  };

  const DashboardTrendTooltip = ({ active, payload }: { active?: boolean; payload?: DashboardTooltipEntry[] }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="admin-chart-tooltip">
        <div className="admin-chart-tooltip-date">{payload[0].payload.fullDate}</div>
        {payload.map((entry) => (
          <div key={entry.name} className="admin-chart-tooltip-row">
            <span className="admin-chart-tooltip-dot" style={{ backgroundColor: entry.color }} />
            <span className="admin-chart-tooltip-label">{entry.name}</span>
            <span className="admin-chart-tooltip-value">{formatCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading && !dashboard) {
    return (
      <AdminLayout title="Dashboard">
        <div className="admin-loading" style={{ padding: '3rem', textAlign: 'center' }}>
          Đang tải dashboard quản trị...
        </div>
      </AdminLayout>
    );
  }

  if (loadError && !dashboard) {
    return (
      <AdminLayout title="Dashboard">
        <AdminStateBlock
          type="error"
          title="Không thể tải dashboard"
          description={loadError}
          actionLabel="Thử lại"
          onAction={loadDashboard}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Dashboard">
      <DateRangeFilter value={rangeQuery} onChange={setRangeQuery} loading={isLoading} />
      <section className="admin-stats grid-6">
        {stats.map((item) => (
          <motion.div
            className="admin-stat-card compact"
            key={item.label}
            whileHover={{ y: -2 }}
          >
            <div className="admin-stat-header">
              <div className="admin-stat-icon">{item.icon}</div>
              <div className={`admin-stat-change ${item.tone}`}>
                <ArrowUpRight size={14} />
                <span>{item.change}</span>
              </div>
            </div>
            <p className="admin-stat-label">{item.label}</p>
            <Link to={item.to} className="admin-stat-link" title={`Xem ${item.label}`}>
              <span className="admin-stat-value">{item.value}</span>
              <ChevronRight size={14} />
            </Link>
          </motion.div>
        ))}
      </section>

      <motion.section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Biểu đồ doanh thu</h2>
            <span className="admin-muted">
              {dashboard?.analytics
                ? `Doanh thu gộp và thực nhận ${getAnalyticsRangeLabel(dashboard.analytics.bucket).toLowerCase()}`
                : 'Doanh thu gộp và thực nhận theo khoảng đã chọn'}
            </span>
          </div>
        </div>
        <div className="area-chart-wrap">
          {chartData.length === 0 ? (
            <div className="admin-chart-empty">
              <TrendingUp size={36} className="admin-chart-empty-icon" />
              <p>Chưa có dữ liệu doanh thu</p>
              <span className="admin-muted">Dữ liệu sẽ hiển thị khi hệ thống ghi nhận đơn hàng.</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminGmvGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="adminNetRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                />
                <YAxis
                  width={50}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  domain={[0, yAxisMax]}
                  tickFormatter={formatCompactMoney}
                />
                <Tooltip content={<DashboardTrendTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  formatter={(value: string) => <span className="admin-chart-legend-label">{value}</span>}
                />
                <Area
                  type="monotone"
                  dataKey="gmv"
                  name="Doanh thu gộp"
                  stroke="#16a34a"
                  strokeWidth={2}
                  fill="url(#adminGmvGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="netRevenue"
                  name="Thực nhận"
                  stroke="#f97316"
                  strokeWidth={2}
                  fill="url(#adminNetRevenueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.section>

      <div className="admin-action-bar">
        <motion.section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Hành động của quản trị viên</h2>
          </div>
          <div className="action-bar-tiles">
            <Link to="/admin/stores" className="action-bar-tile"><Zap size={20} /> Duyệt vendor</Link>
            <Link to="/admin/promotions" className="action-bar-tile"><TicketPercent size={20} /> Tạo mega sale</Link>
            <Link to="/admin/categories" className="action-bar-tile"><FolderTree size={20} /> Quản lý danh mục</Link>
            <Link to="/admin/bot-ai" className="action-bar-tile"><Sparkles size={20} /> Bot, FAQ và AI</Link>
          </div>
        </motion.section>

        <motion.section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Nguồn cấp dữ liệu quản trị</h2>
          </div>
          <div className="action-bar-feed">
            {governanceFeed.map((item) => (
              <Link key={item.id} to={item.to} className={`action-bar-feed-item ${item.tone}`}>
                <span className="feed-icon">{item.icon}</span>
                <div className="feed-content">
                  <p>{item.text}</p>
                  <span>{item.cta}</span>
                </div>
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
        </motion.section>
      </div>

      <motion.section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Danh mục dẫn đầu hệ thống</h2>
          <Link to="/admin/categories">Mở danh mục</Link>
        </div>
        {topCategories.length === 0 ? (
          <AdminStateBlock
            type="empty"
            title="Chưa có dữ liệu danh mục nổi bật"
            description="Khi danh mục có đủ dữ liệu sản phẩm hoạt động, bảng xếp hạng sẽ hiển thị tại đây."
          />
        ) : (
          <div className="top-products">
            {topCategories.map((item, idx) => (
              <motion.div key={item.categoryId} className="top-product" whileHover={{ y: -2 }}>
                <div className="top-rank">Top {idx + 1}</div>
                <img
                  className="top-category-image"
                  src={resolveCategoryImage(item.name, item.image)}
                  alt={item.name}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = buildCategoryFallbackImage(item.name);
                  }}
                />
                <div className="top-product-meta">
                  <p className="admin-bold">{item.name}</p>
                  <p className="admin-muted">{item.signal}</p>
                  <div className="top-product-bar">
                    <span style={{ width: `${Math.round((item.productCount / topSignalBase) * 100)}%` }} />
                  </div>
                  <p className="admin-muted stock-note">{item.productCount} sản phẩm active</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>
    </AdminLayout>
  );
};

export default Admin;
