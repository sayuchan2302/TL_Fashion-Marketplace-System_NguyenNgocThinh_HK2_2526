import './Vendor.css';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  Clock,
  DollarSign,
  Flame,
  Package,
  Plus,
  ShoppingCart,
  Store,
  TicketPercent,
  Users,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import VendorLayout from './VendorLayout';
import { getVendorOrderStatusLabel, getVendorOrderStatusTone } from './vendorOrderPresentation';
import { formatCurrency } from '../../services/commissionService';
import {
  vendorPortalService,
  type VendorAnalyticsData,
  type VendorDashboardData,
  type VendorOrderSummary,
} from '../../services/vendorPortalService';
import type { AnalyticsMetricChange } from '../../services/analyticsTypes';
import { vendorVoucherService } from '../../services/vendorVoucherService';
import { walletService, type VendorWallet } from '../../services/walletService';
import { useToast } from '../../contexts/ToastContext';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { AdminStateBlock } from '../Admin/AdminStateBlocks';
import VendorAnalyticsSection from './components/analytics/VendorAnalyticsSection';
import { emptyVendorAnalytics } from './vendorAnalyticsShared';
import DateRangeFilter from '../../components/Analytics/DateRangeFilter';
import { getAnalyticsQueryFromSearchParams } from '../../components/Analytics/analyticsRange';
import {
  resolveDetailRouteKey,
  toDisplayOrderCode,
} from '../../utils/displayCode';

const initialData: VendorDashboardData = {
  stats: {
    todayOrders: 0,
    pendingOrders: 0,
    totalRevenue: 0,
    totalPayout: 0,
    totalProducts: 0,
    rating: 0,
    commissionRate: 5,
  },
  recentOrders: [],
  topProducts: [],
};

const formatAnalyticsChange = (change?: AnalyticsMetricChange) => {
  if (!change) return 'Hiện tại';
  if (change.percent === null) return change.absolute > 0 ? 'Mới phát sinh' : '—';
  return `${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(1)}%`;
};

const getAnalyticsChangeTone = (change?: AnalyticsMetricChange) => (
  !change || change.percent === null || change.percent >= 0 ? 'up' : 'down'
);

const VendorDashboard = () => {
  const { addToast } = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const analyticsSectionRef = useRef<HTMLElement | null>(null);
  const [data, setData] = useState<VendorDashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [runningVoucherCount, setRunningVoucherCount] = useState(0);
  const [wallet, setWallet] = useState<VendorWallet | null>(null);
  const [analytics, setAnalytics] = useState<VendorAnalyticsData>(emptyVendorAnalytics);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsReloadKey, setAnalyticsReloadKey] = useState(0);
  const [rangeQuery, setRangeQuery] = useState(() => getAnalyticsQueryFromSearchParams(searchParams));

  useEffect(() => {
    setSearchParams({ from: rangeQuery.from, to: rangeQuery.to, bucket: rangeQuery.bucket }, { replace: true });
  }, [rangeQuery, setSearchParams]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        setLoadError('');
        const [next, voucherResult, walletData] = await Promise.all([
          vendorPortalService.getDashboardData(),
          vendorVoucherService.list({ status: 'running', page: 1, size: 1 }),
          walletService.getMyWallet(),
        ]);
        if (!active) return;
        startTransition(() => {
          setData(next);
          setRunningVoucherCount(voucherResult.counts.running);
          setWallet(walletData);
        });
      } catch (err: unknown) {
        if (!active) return;
        const message = getUiErrorMessage(err, 'Không tải được bảng điều khiển gian hàng');
        setLoadError(message);
        setData(initialData);
        setRunningVoucherCount(0);
        setWallet(null);
        addToast(message, 'error');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [addToast, reloadKey]);

  useEffect(() => {
    let active = true;

    const loadAnalytics = async () => {
      setAnalyticsLoading(true);
      try {
        setAnalyticsError('');
        const next = await vendorPortalService.getAnalytics(rangeQuery);
        if (!active) return;
        startTransition(() => {
          setAnalytics(next);
          setAnalyticsLoading(false);
        });
      } catch (err: unknown) {
        if (!active) return;
        const message = getUiErrorMessage(err, 'Không tải được biểu đồ doanh thu');
        startTransition(() => {
          setAnalyticsError(message);
          setAnalytics(emptyVendorAnalytics);
          setAnalyticsLoading(false);
        });
      }
    };

    void loadAnalytics();

    return () => {
      active = false;
    };
  }, [analyticsReloadKey, rangeQuery]);

  const handleAnalyticsRetry = useCallback(() => {
    setAnalyticsReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (location.hash !== '#analytics') return;
    const node = analyticsSectionRef.current;
    if (!node) return;

    const rafId = window.requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [location.hash, analyticsLoading]);

  const stats = data.stats;
  const selectedSummary = analytics.analytics?.summary;
  const selectedChanges = analytics.analytics?.changes;
  const topSaleBase = Math.max(...data.topProducts.map((product) => product.sales), 1);

  const statCards = [
    {
      label: 'Đơn giao thành công',
      value: selectedSummary?.deliveredOrders ?? stats.todayOrders,
      change: formatAnalyticsChange(selectedChanges?.deliveredOrders),
      tone: getAnalyticsChangeTone(selectedChanges?.deliveredOrders),
      icon: <ShoppingCart size={18} />,
      to: '/vendor/orders?status=delivered',
    },
    {
      label: 'Doanh thu gộp',
      value: formatCurrency(selectedSummary?.grossRevenue ?? stats.totalRevenue),
      change: formatAnalyticsChange(selectedChanges?.grossRevenue),
      tone: getAnalyticsChangeTone(selectedChanges?.grossRevenue),
      icon: <DollarSign size={18} />,
      to: '/vendor/dashboard#analytics',
    },
    {
      label: 'Tiền thực nhận',
      value: formatCurrency(selectedSummary?.payout ?? stats.totalPayout),
      change: formatAnalyticsChange(selectedChanges?.payout),
      tone: getAnalyticsChangeTone(selectedChanges?.payout),
      icon: <BarChart3 size={18} />,
      to: '/vendor/dashboard#analytics',
      cardTone: 'teal',
    },
    {
      label: 'Phí sàn',
      value: formatCurrency(selectedSummary?.commission ?? 0),
      change: formatAnalyticsChange(selectedChanges?.commission),
      tone: getAnalyticsChangeTone(selectedChanges?.commission),
      icon: <TicketPercent size={18} />,
      to: '/vendor/finance',
    },
    {
      label: 'Giá trị đơn trung bình',
      value: formatCurrency(selectedSummary?.averageOrderValue ?? 0),
      change: formatAnalyticsChange(selectedChanges?.averageOrderValue),
      tone: getAnalyticsChangeTone(selectedChanges?.averageOrderValue),
      icon: <DollarSign size={18} />,
      to: '/vendor/dashboard#analytics',
    },
    {
      label: 'Khách hàng đã mua',
      value: selectedSummary?.distinctCustomers ?? 0,
      change: formatAnalyticsChange(selectedChanges?.distinctCustomers),
      tone: getAnalyticsChangeTone(selectedChanges?.distinctCustomers),
      icon: <Users size={18} />,
      to: '/vendor/dashboard#analytics',
    },
  ];

  const quickActions = [
    { label: 'Thêm sản phẩm', icon: <Plus size={18} />, to: '/vendor/products?action=add' },
    { label: 'Xử lý đơn hàng', icon: <ShoppingCart size={18} />, to: '/vendor/orders' },
    { label: 'Trang trí gian hàng', icon: <Store size={18} />, to: '/vendor/storefront' },
    { label: 'Rút tiền & đối soát', icon: <BarChart3 size={18} />, to: '/vendor/finance' },
  ];

  const handleConfirmOrder = async (order: VendorOrderSummary) => {
    setUpdatingId(order.id);
    await vendorPortalService.updateOrderStatus(order.id, 'CONFIRMED');
    startTransition(() => {
      setData((current) => ({
        ...current,
        recentOrders: current.recentOrders.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status: 'confirmed',
              }
            : item,
        ),
      }));
    });
    setUpdatingId(null);
    addToast('Đã cập nhật trạng thái đơn hàng con', 'success');
  };

  return (
    <VendorLayout
      title="Dashboard"
      breadcrumbs={['Kênh Người Bán', 'Dashboard']}
    >
      <DateRangeFilter value={rangeQuery} onChange={setRangeQuery} loading={analyticsLoading} />
      {loadError ? (
        <section className="admin-panels single">
          <AdminStateBlock
            type="error"
            title="Không tải được dữ liệu tổng quan"
            description={loadError}
            actionLabel="Thử lại"
            onAction={() => setReloadKey((key) => key + 1)}
          />
        </section>
      ) : null}

      <section className="vendor-stats grid-6">
        {statCards.map((item, idx) => (
          <motion.div
            className={`vendor-stat-card compact ${item.cardTone || ''}`}
            key={item.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: idx * 0.03 }}
            whileHover={{ y: -2 }}
          >
            <div className="vendor-stat-header">
              <div className="vendor-stat-icon">{item.icon}</div>
              <div className={`vendor-stat-change ${item.tone}`}>
                {item.tone === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                <span>{item.change}</span>
              </div>
            </div>
            <p className="vendor-stat-label">{item.label}</p>
            <Link
              to={item.to}
              className="vendor-stat-link"
            >
              <span className="vendor-stat-value">{item.value}</span>
              <ChevronRight size={14} />
            </Link>
          </motion.div>
        ))}
      </section>

      <section className="vendor-operational-summary" aria-label="Chỉ số vận hành hiện tại">
        <Link to="/vendor/orders?status=pending" className="vendor-operational-item">
          <Clock size={16} />
          <span>Chờ xác nhận</span>
          <strong>{stats.pendingOrders}</strong>
        </Link>
        <Link to="/vendor/products" className="vendor-operational-item">
          <Package size={16} />
          <span>Sản phẩm đang bán</span>
          <strong>{stats.totalProducts}</strong>
        </Link>
        <Link to="/vendor/promotions" className="vendor-operational-item">
          <TicketPercent size={16} />
          <span>Voucher đang chạy</span>
          <strong>{runningVoucherCount}</strong>
        </Link>
      </section>

      {!loadError ? (
        <motion.section
          ref={analyticsSectionRef}
          id="analytics"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.12 }}
          style={{ marginBottom: 16, scrollMarginTop: 24 }}
        >
          <VendorAnalyticsSection
            analytics={analytics}
            loading={analyticsLoading}
            error={analyticsError}
            onRetry={handleAnalyticsRetry}
          />
        </motion.section>
      ) : null}

      <motion.section
        className="commission-card"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.15 }}
        style={{ marginBottom: 16 }}
      >
        <h3>Số dư ví: hoa hồng {stats.commissionRate}%</h3>
        <div className="commission-row">
          <span className="label">Khả dụng (rút được)</span>
          <span className="value positive">{formatCurrency(wallet?.availableBalance ?? 0)}</span>
        </div>
        <div className="commission-row">
          <span className="label">Đóng băng (chờ 7 ngày)</span>
          <span className="value warning">{formatCurrency(wallet?.frozenBalance ?? 0)}</span>
        </div>
        <div className="commission-divider" />
        <div className="commission-row total">
          <span className="label">Tổng số dư</span>
          <span className="value">{formatCurrency(wallet?.totalBalance ?? 0)}</span>
        </div>
      </motion.section>

      <motion.section
        className="vendor-panel"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.18 }}
        style={{ marginBottom: 16 }}
      >
        <div className="vendor-panel-head">
          <h2>Thao tác nhanh cho chủ shop</h2>
        </div>
        <div className="vendor-quick-actions">
          {quickActions.map((action) => (
            <Link key={action.label} to={action.to} className="vendor-action-tile">
              {action.icon}
              {action.label}
            </Link>
          ))}
        </div>
      </motion.section>

      <div className="vendor-panels">
        <motion.section
          className="vendor-panel"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.2 }}
        >
          <div className="vendor-panel-head">
            <h2>Đơn hàng mới cần xử lý</h2>
            <Link to="/vendor/orders">Xem tất cả</Link>
          </div>

          {loading ? (
            <div className="vendor-state-block">
              <div className="vendor-state-icon"><Clock size={20} /></div>
              <h3>Đang đồng bộ dữ liệu</h3>
              <p>Đơn hàng và số liệu đối soát đang được cập nhật từ hệ thống.</p>
            </div>
          ) : data.recentOrders.length === 0 ? (
            <div className="vendor-state-block">
              <div className="vendor-state-icon"><Package size={20} /></div>
              <h3>Chưa có đơn hàng nào</h3>
              <p>Khi shop nhận được đơn mới, danh sách sẽ hiển thị tại đây để xử lý.</p>
            </div>
          ) : (
            <div className="vendor-table" role="table">
              <div className="vendor-table-row vendor-table-head orders" role="row">
                <div role="columnheader">Đơn hàng</div>
                <div role="columnheader">Khách hàng</div>
                <div role="columnheader">Tổng tiền</div>
                <div role="columnheader">Phí sàn</div>
                <div role="columnheader">Thực nhận</div>
                <div role="columnheader">Trạng thái</div>
                <div role="columnheader">Hành động</div>
              </div>
              {data.recentOrders.map((order, idx) => (
                <motion.div
                  className="vendor-table-row orders"
                  role="row"
                  key={order.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: 0.22 + idx * 0.03 }}
                >
                  <div role="cell" className="admin-bold">{toDisplayOrderCode(order.code)}</div>
                  <div role="cell">{order.customer}</div>
                  <div role="cell" className="admin-bold">{formatCurrency(order.total)}</div>
                  <div role="cell" className="vendor-dashboard-money warning">-{formatCurrency(order.commissionFee)}</div>
                  <div role="cell" className="vendor-dashboard-money positive">{formatCurrency(order.vendorPayout)}</div>
                  <div role="cell">
                    <span className={`vendor-pill ${getVendorOrderStatusTone(order.status)}`}>
                      {getVendorOrderStatusLabel(order.status)}
                    </span>
                  </div>
                  <div role="cell" className="vendor-actions">
                    {order.status === 'pending' && (
                      <button
                        className="vendor-primary-btn compact"
                        onClick={() => void handleConfirmOrder(order)}
                        disabled={updatingId === order.id}
                      >
                        {updatingId === order.id ? 'Đang xử lý...' : 'Xác nhận'}
                      </button>
                    )}
                    <Link
                      to={`/vendor/orders/${resolveDetailRouteKey(order.code, order.id)}`}
                      className="vendor-icon-btn subtle"
                      aria-label="Xem chi tiết"
                    >
                      <ChevronRight size={15} />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        <motion.section
          className="vendor-panel"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.24 }}
        >
          <div className="vendor-panel-head">
            <h2>Top sản phẩm của shop</h2>
            <Link to="/vendor/products">Xem tất cả</Link>
          </div>

          {data.topProducts.length === 0 ? (
            <div className="vendor-state-block">
              <div className="vendor-state-icon"><BarChart3 size={20} /></div>
              <h3>Chưa có dữ liệu hiệu suất</h3>
              <p>Sản phẩm bán chạy sẽ hiển thị tại đây khi shop có dữ liệu đơn hàng.</p>
            </div>
          ) : (
            <div className="vendor-top-products">
              {data.topProducts.map((product, idx) => (
                <motion.div
                  key={product.id}
                  className="vendor-top-product"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18, delay: 0.26 + idx * 0.04 }}
                >
                  <img src={product.img} alt={product.name} />
                  <div className="vendor-top-product-meta">
                    <span className="name">{product.name}</span>
                    <span className="stats">
                      <Flame size={13} /> {product.sales} đã bán
                      <span style={{ marginLeft: 8 }}>{formatCurrency(product.revenue)}</span>
                    </span>
                    <div className="vendor-top-product-bar">
                      <span style={{ width: `${Math.round((product.sales / topSaleBase) * 100)}%` }} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>
      </div>
    </VendorLayout>
  );
};

export default VendorDashboard;
