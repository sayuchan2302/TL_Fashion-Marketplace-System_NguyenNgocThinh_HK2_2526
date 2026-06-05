import { useMemo } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { toDisplayOrderCode } from '../utils/displayCode';

type StaticRouteTitle = {
  path: string;
  title: string;
};

const STATIC_ROUTE_TITLES: StaticRouteTitle[] = [
  { path: '/', title: 'Trang chủ' },
  { path: '/cart', title: 'Giỏ hàng' },
  { path: '/checkout', title: 'Thanh toán' },
  { path: '/login', title: 'Đăng nhập' },
  { path: '/register', title: 'Đăng ký' },
  { path: '/forgot', title: 'Quên mật khẩu' },
  { path: '/reset-password', title: 'Đặt lại mật khẩu' },
  { path: '/vendor/register', title: 'Đăng ký bán hàng' },
  { path: '/order-success', title: 'Đặt hàng thành công' },
  { path: '/wishlist', title: 'Yêu thích' },
  { path: '/order-tracking', title: 'Theo dõi đơn hàng' },
  { path: '/faq', title: 'FAQ' },
  { path: '/size-guide', title: 'Bảng size' },
  { path: '/about', title: 'Về Phố Mặc' },
  { path: '/contact', title: 'Liên hệ' },
  { path: '/account/orders', title: 'Đơn hàng của tôi' },
  { path: '/account/addresses', title: 'Sổ địa chỉ' },
  { path: '/account/security', title: 'Bảo mật tài khoản' },
  { path: '/admin', title: 'Quản trị sàn - Dashboard' },
  { path: '/admin/dashboard', title: 'Quản trị sàn - Dashboard' },
  { path: '/admin/categories', title: 'Quản trị sàn - Danh mục' },
  { path: '/admin/product-governance', title: 'Quản trị sàn - Kiểm duyệt sản phẩm' },
  { path: '/admin/product-governance/reports', title: 'Quản trị sàn - Kiểm duyệt tố cáo sản phẩm' },
  { path: '/admin/stores', title: 'Quản trị sàn - Gian hàng' },
  { path: '/admin/users', title: 'Quản trị sàn - Người dùng' },
  { path: '/admin/orders', title: 'Quản trị sàn - Đơn hàng' },
  { path: '/admin/returns', title: 'Quản trị sàn - Hoàn trả' },
  { path: '/admin/reviews', title: 'Quản trị sàn - Đánh giá' },
  { path: '/admin/reports', title: 'Quản trị sàn - Tố cáo sản phẩm' },
  { path: '/admin/financials', title: 'Quản trị sàn - Tài chính' },
  { path: '/admin/promotions', title: 'Quản trị sàn - Voucher toàn sàn' },
  { path: '/admin/bot-ai', title: 'Quản trị sàn - Bot và AI' },
  { path: '/admin/image-vision', title: 'Quản trị sàn - Image Vision' },
  { path: '/vendor/dashboard', title: 'Kênh người bán - Dashboard' },
  { path: '/vendor/storefront', title: 'Kênh người bán - Gian hàng' },
  { path: '/vendor/products', title: 'Kênh người bán - Sản phẩm' },
  { path: '/vendor/orders', title: 'Kênh người bán - Đơn hàng' },
  { path: '/vendor/returns', title: 'Kênh người bán - Hoàn trả' },
  { path: '/vendor/finance', title: 'Kênh người bán - Tài chính' },
  { path: '/vendor/promotions', title: 'Kênh người bán - Voucher cửa hàng' },
  { path: '/vendor/reviews', title: 'Kênh người bán - Đánh giá' },
];

const CATEGORY_TITLES: Record<string, string> = {
  accessories: 'Phụ kiện',
  men: 'Thời trang nam',
  nam: 'Thời trang nam',
  new: 'Sản phẩm mới',
  nu: 'Thời trang nữ',
  'phu-kien': 'Phụ kiện',
  sale: 'Flash Sale',
  women: 'Thời trang nữ',
};

const POLICY_TITLES: Record<string, string> = {
  'bao-mat': 'Chính sách bảo mật',
  'giao-hang': 'Chính sách giao hàng',
  'khieu-nai': 'Chính sách khiếu nại',
  'khuyen-mai': 'Chính sách khuyến mãi',
  'marketplace-tos': 'Marketplace ToS',
  'thanh-toan': 'Chính sách thanh toán',
  dispute: 'Giải quyết tranh chấp',
  san: 'Chính sách Sàn',
  vendor: 'Chính sách Vendor',
};

const PROFILE_TAB_TITLES: Record<string, string> = {
  account: 'Tài khoản',
  addresses: 'Sổ địa chỉ',
  notifications: 'Thông báo',
  orders: 'Đơn hàng của tôi',
  reviews: 'Đánh giá của tôi',
  vouchers: 'Ví voucher',
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const formatSlugTitle = (value?: string) => {
  if (!value) {
    return '';
  }

  return safeDecode(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word))
    .join(' ');
};

const matchRoute = (path: string, pathname: string) => matchPath({ path, end: true }, pathname);

const getSearchTitle = (searchParams: URLSearchParams) => {
  const query = (searchParams.get('q') || '').trim();
  const scope = searchParams.get('scope');

  if (searchParams.get('imageSearch')) {
    return 'Tìm kiếm bằng ảnh';
  }

  if (searchParams.get('flashSale') === '1') {
    return 'Flash Sale';
  }

  if (query && scope === 'stores') {
    return `Tìm cửa hàng "${query}"`;
  }

  if (query) {
    return `Tìm kiếm "${query}"`;
  }

  return 'Tìm kiếm';
};

const getPaymentResultTitle = (searchParams: URLSearchParams) => {
  const status = (searchParams.get('status') || '').toLowerCase();

  if (status === 'success' || status === 'paid') {
    return 'Thanh toán thành công';
  }

  if (status === 'failed' || status === 'fail' || status === 'cancelled' || status === 'canceled') {
    return 'Thanh toán thất bại';
  }

  if (status === 'pending' || status === 'processing') {
    return 'Đang xử lý thanh toán';
  }

  return 'Kết quả thanh toán';
};

const getCategoryTitle = (slug?: string) => {
  if (!slug) {
    return 'Danh mục';
  }

  return CATEGORY_TITLES[slug] || formatSlugTitle(slug) || 'Danh mục';
};

const getPageTitle = (pathname: string, search: string) => {
  const searchParams = new URLSearchParams(search);

  if (matchRoute('/search', pathname)) {
    return getSearchTitle(searchParams);
  }

  if (matchRoute('/payment-result', pathname)) {
    return getPaymentResultTitle(searchParams);
  }

  if (matchRoute('/profile', pathname)) {
    const tab = searchParams.get('tab') || 'account';
    return PROFILE_TAB_TITLES[tab] || PROFILE_TAB_TITLES.account;
  }

  const categoryMatch = matchRoute('/category/:id', pathname);
  if (categoryMatch?.params.id) {
    return getCategoryTitle(categoryMatch.params.id);
  }

  if (matchRoute('/product/:id', pathname)) {
    return 'Sản phẩm';
  }

  if (matchRoute('/store/:slug', pathname)) {
    return 'Gian hàng';
  }

  const policyMatch = matchRoute('/policy/:type', pathname);
  if (policyMatch?.params.type) {
    return POLICY_TITLES[policyMatch.params.type] || 'Chính sách';
  }

  const clientOrderMatch =
    matchRoute('/profile/orders/:id', pathname) || matchRoute('/account/orders/:id', pathname);
  if (clientOrderMatch?.params.id) {
    return `Đơn hàng #${toDisplayOrderCode(clientOrderMatch.params.id)}`;
  }

  const adminOrderMatch = matchRoute('/admin/orders/:id', pathname);
  if (adminOrderMatch?.params.id) {
    return `Quản trị sàn - Đơn hàng #${toDisplayOrderCode(adminOrderMatch.params.id)}`;
  }

  const vendorOrderMatch = matchRoute('/vendor/orders/:id', pathname);
  if (vendorOrderMatch?.params.id) {
    return `Kênh người bán - Đơn hàng #${toDisplayOrderCode(vendorOrderMatch.params.id)}`;
  }

  const staticRoute = STATIC_ROUTE_TITLES.find((route) => matchRoute(route.path, pathname));
  if (staticRoute) {
    return staticRoute.title;
  }

  if (pathname.startsWith('/admin')) {
    return 'Quản trị sàn - Dashboard';
  }

  if (pathname.startsWith('/vendor')) {
    return 'Kênh người bán - Dashboard';
  }

  return 'Không tìm thấy trang';
};

const PageTitleManager = () => {
  const location = useLocation();
  const title = useMemo(
    () => getPageTitle(location.pathname, location.search),
    [location.pathname, location.search],
  );

  usePageTitle(title);

  return null;
};

export default PageTitleManager;
