import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  User,
  ShoppingBag,
  Ticket,
  MapPin,
  MessageSquare,
  ChevronRight,
  LogOut,
  Bell,
  Camera
} from 'lucide-react';
import AddressModal from './AddressModal';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import ReviewModal from '../../components/ReviewModal/ReviewModal';
import ProfileTabContent from './components/ProfileTabContent';
import ReturnRequestDrawer from '../OrderDetail/ReturnRequestDrawer';
import type { PendingProduct } from './components/ProfileTabContent.types';
import ProfileAccountModal from './components/ProfileAccountModal';
import ProfilePasswordModal from './components/ProfilePasswordModal';
import ProfileFollowingModal from './components/ProfileFollowingModal';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import Skeleton from '../../components/Skeleton/Skeleton';
import { CLIENT_TEXT } from '../../utils/texts';
import { CLIENT_TOAST_MESSAGES } from '../../utils/clientMessages';
import type { Notification } from '../../services/notificationService';
import { addressService } from '../../services/addressService';
import { orderService } from '../../services/orderService';
import { reviewService, type EligibleReviewItem, type Review as CustomerReview } from '../../services/reviewService';
import { customerVoucherService, type CustomerWalletVoucher } from '../../services/customerVoucherService';
import { profileService, type UserProfileRecord } from '../../services/profileService';
import { authService } from '../../services/authService';
import { storeFollowService, type FollowedStoreItem } from '../../services/storeFollowService';
import { calculateTier, TIER_CONFIG, getProgressToNextTier, getSpendRequiredForNextTier, getNextTier } from '../../utils/tierUtils';
import { formatPrice } from '../../utils/formatters';
import { resolveDetailRouteKey } from '../../utils/displayCode';
import { resolveAvatarSrc } from '../../utils/avatar';
import { usePageTitle } from '../../hooks/usePageTitle';
import type { Address } from '../../types';
import type { Order } from '../../types';
import './Profile.css';
import '../OrderDetail/OrderDetail.css';

const t = CLIENT_TEXT.profile;
const tCommon = CLIENT_TEXT.common;

type TabId = 'account' | 'orders' | 'vouchers' | 'addresses' | 'reviews' | 'notifications';
const VALID_PROFILE_TABS: TabId[] = ['account', 'orders', 'vouchers', 'addresses', 'reviews', 'notifications'];
const PROFILE_TAB_PAGE_TITLES: Record<TabId, string> = {
  account: 'Tài khoản',
  addresses: 'Sổ địa chỉ',
  notifications: 'Thông báo',
  orders: 'Đơn hàng của tôi',
  reviews: 'Đánh giá của tôi',
  vouchers: 'Ví voucher',
};
const ORDERS_PER_PAGE = 5;
const REVIEWS_PER_PAGE = 5;
const NOTIFICATIONS_PER_PAGE = 7;
const VOUCHERS_PER_PAGE = 10;

const mapEligibleReview = (item: EligibleReviewItem): PendingProduct => {
  const details = [
    item.variantName?.trim() || null,
    item.quantity > 0 ? `Số lượng: ${item.quantity}` : null,
  ].filter(Boolean).join(' | ');

  return {
    productId: item.productId,
    productName: item.productName,
    productImage: item.productImage || 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=80&h=80&fit=crop',
    orderId: item.orderId,
    orderCode: item.orderCode,
    variant: details || 'Đơn hàng đã giao',
  };
};

const GENDER_LABEL: Record<'MALE' | 'FEMALE' | 'OTHER', string> = {
  MALE: 'Nam',
  FEMALE: 'Nữ',
  OTHER: 'Khác',
};

const getVoucherMeta = (voucher: CustomerWalletVoucher) => {
  if (voucher.displayStatus === 'USED') {
    return { text: 'Đã sử dụng', tone: 'used' as const };
  }
  if (voucher.displayStatus === 'EXPIRED') {
    return { text: 'Đã hết hạn', tone: 'expired' as const };
  }
  if (voucher.displayStatus === 'REVOKED') {
    return { text: 'Không khả dụng', tone: 'revoked' as const };
  }
  return { text: `Còn ${voucher.remaining}`, tone: 'available' as const };
};

const isMarketplaceVoucher = (voucher: CustomerWalletVoucher) =>
  voucher.claimSource === 'ADMIN_AUTO';

const marketplaceVoucherGroupKey = (voucher: CustomerWalletVoucher) =>
  [
    voucher.code,
    voucher.type,
    String(voucher.value ?? ''),
    String(voucher.minOrderValue ?? ''),
    voucher.expiresAt || '',
  ].join('|');

const voucherStatusRank = (voucher: CustomerWalletVoucher) => {
  switch (voucher.displayStatus) {
    case 'AVAILABLE':
      return 0;
    case 'USED':
      return 1;
    case 'EXPIRED':
      return 2;
    case 'REVOKED':
      return 3;
    default:
      return 4;
  }
};

const pickBetterMarketplaceVoucher = (
  current: CustomerWalletVoucher,
  candidate: CustomerWalletVoucher,
) => {
  const currentRank = voucherStatusRank(current);
  const candidateRank = voucherStatusRank(candidate);
  if (candidateRank < currentRank) return candidate;
  if (candidateRank > currentRank) return current;

  if ((candidate.remaining || 0) > (current.remaining || 0)) return candidate;
  if ((candidate.remaining || 0) < (current.remaining || 0)) return current;

  const candidateTime = new Date(candidate.claimedAt || 0).getTime();
  const currentTime = new Date(current.claimedAt || 0).getTime();
  if (candidateTime > currentTime) return candidate;
  return current;
};

const dedupeMarketplaceVouchers = (vouchers: CustomerWalletVoucher[]) => {
  const bestByKey = new Map<string, CustomerWalletVoucher>();
  vouchers.forEach((voucher) => {
    if (!isMarketplaceVoucher(voucher)) return;
    const key = marketplaceVoucherGroupKey(voucher);
    const current = bestByKey.get(key);
    bestByKey.set(key, current ? pickBetterMarketplaceVoucher(current, voucher) : voucher);
  });

  const emitted = new Set<string>();
  const result: CustomerWalletVoucher[] = [];
  vouchers.forEach((voucher) => {
    if (!isMarketplaceVoucher(voucher)) {
      result.push(voucher);
      return;
    }
    const key = marketplaceVoucherGroupKey(voucher);
    if (emitted.has(key)) return;
    emitted.add(key);
    result.push(bestByKey.get(key) || voucher);
  });
  return result;
};

const isVisibleWalletVoucher = (voucher: CustomerWalletVoucher) =>
  voucher.displayStatus === 'AVAILABLE' || voucher.displayStatus === 'USED';

const sortVisibleWalletVouchers = (vouchers: CustomerWalletVoucher[]) =>
  [...vouchers].sort((left, right) => {
    const leftRank = left.displayStatus === 'AVAILABLE' ? 0 : 1;
    const rightRank = right.displayStatus === 'AVAILABLE' ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;

    return new Date(left.expiresAt || 0).getTime() - new Date(right.expiresAt || 0).getTime();
  });

const Profile = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { logout, user: authUser } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState<string | null>(null);
  const activeTab = useMemo(() => {
    const tabParam = searchParams.get('tab');
    return VALID_PROFILE_TABS.includes(tabParam as TabId) ? (tabParam as TabId) : 'account';
  }, [searchParams]);
  usePageTitle(PROFILE_TAB_PAGE_TITLES[activeTab]);

  const handleTabChange = (tab: TabId) => {
    const nextParams = new URLSearchParams(searchParams);
    if (tab === 'account') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', tab);
    }
    nextParams.delete('orderId');
    setSearchParams(nextParams);
  };

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [height, setHeight] = useState('163');
  const [weight, setWeight] = useState('57');
  const [accountName, setAccountName] = useState('');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountGender, setAccountGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('OTHER');
  const [accountDateOfBirth, setAccountDateOfBirth] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [pendingDeleteAddressId, setPendingDeleteAddressId] = useState<string | null>(null);
  const [pendingCancelOrderId, setPendingCancelOrderId] = useState<string | null>(null);
  const [isDeletingAddress, setIsDeletingAddress] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [voucherWallet, setVoucherWallet] = useState<CustomerWalletVoucher[]>([]);
  const [voucherPage, setVoucherPage] = useState(1);

  const displayVoucherWallet = useMemo(
    () => sortVisibleWalletVouchers(dedupeMarketplaceVouchers(voucherWallet).filter(isVisibleWalletVoucher)),
    [voucherWallet],
  );

  const handleEditAddress = (address: Address) => {
    setEditingAddress(address);
    setIsAddressModalOpen(true);
  };

  const handleAddAddress = () => {
    setEditingAddress(null);
    setIsAddressModalOpen(true);
  };

  const handleCloseAddressModal = () => {
    setIsAddressModalOpen(false);
    setEditingAddress(null);
  };

  const orders = useMemo(
    () => (activeTab === 'orders' ? allOrders : []),
    [activeTab, allOrders],
  );
  const vouchers = useMemo(
    () => (activeTab === 'vouchers' ? displayVoucherWallet : []),
    [activeTab, displayVoucherWallet],
  );
  const totalVoucherPages = useMemo(
    () => Math.max(1, Math.ceil(vouchers.length / VOUCHERS_PER_PAGE)),
    [vouchers.length],
  );
  const pagedVouchers = useMemo(() => {
    if (activeTab !== 'vouchers') {
      return [];
    }
    const start = (voucherPage - 1) * VOUCHERS_PER_PAGE;
    return vouchers.slice(start, start + VOUCHERS_PER_PAGE);
  }, [activeTab, voucherPage, vouchers]);
  const orderCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    allOrders.forEach((order) => {
      if (order.id && order.code) {
        map.set(order.id, order.code);
      }
    });
    return map;
  }, [allOrders]);
  const getOrderDisplayCode = useCallback(
    (orderId: string, orderCode?: string) => {
      const code = (orderCode || orderCodeMap.get(orderId) || '').trim();
      return code || 'Đang cập nhật mã đơn';
    },
    [orderCodeMap],
  );
  const [orderFilter, setOrderFilter] = useState('Tất cả');
  const [orderPage, setOrderPage] = useState(1);

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewProduct, setReviewProduct] = useState<PendingProduct | null>(null);
  const [isReturnDrawerOpen, setIsReturnDrawerOpen] = useState(false);
  const [returnOrder, setReturnOrder] = useState<Order | null>(null);
  const [reviewFilter, setReviewFilter] = useState<'pending' | 'completed'>('pending');
  const [pendingReviewPage, setPendingReviewPage] = useState(1);
  const [completedReviewPage, setCompletedReviewPage] = useState(1);
  const [pendingReviews, setPendingReviews] = useState<PendingProduct[]>([]);
  const [completedReviews, setCompletedReviews] = useState<CustomerReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [isFollowingModalOpen, setIsFollowingModalOpen] = useState(false);
  const [followingStores, setFollowingStores] = useState<FollowedStoreItem[]>([]);
  const [followingStoresLoading, setFollowingStoresLoading] = useState(false);
  const [followingStoresError, setFollowingStoresError] = useState<string | null>(null);
  const [notificationPage, setNotificationPage] = useState(1);

  const handleOpenReturnDrawer = (order: Order) => {
    setReturnOrder(order);
    setIsReturnDrawerOpen(true);
  };

  const handleOpenReviewForOrder = (order: Order) => {
    const firstItem = order.items[0];
    if (firstItem) {
      const details = [
        firstItem.color?.trim() || null,
        firstItem.size?.trim() || null,
      ].filter(Boolean).join(' / ');

      handleOpenReviewModal({
        productId: firstItem.productId || firstItem.id,
        productName: firstItem.name,
        productImage: firstItem.image,
        orderId: order.id,
        orderCode: order.code,
        variant: details || 'Đơn hàng đã giao',
      });
    }
  };

  const handleOpenReviewModal = (product: PendingProduct) => {
    setReviewProduct(product);
    setIsReviewModalOpen(true);
  };

  const handleCloseReviewModal = () => {
    setIsReviewModalOpen(false);
    setReviewProduct(null);
    if (activeTab === 'reviews') {
      void loadReviews();
    }
  };

  const closeFollowingModal = () => {
    setIsFollowingModalOpen(false);
    setFollowingStoresError(null);
  };

  const loadFollowingStores = useCallback(async () => {
    try {
      setFollowingStoresLoading(true);
      setFollowingStoresError(null);
      const rows = await storeFollowService.getMyFollowingStores();
      setFollowingStores(rows);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể tải danh sách theo dõi.';
      setFollowingStoresError(message);
      setFollowingStores([]);
    } finally {
      setFollowingStoresLoading(false);
    }
  }, []);

  const handleOpenFollowingModal = () => {
    setIsFollowingModalOpen(true);
    void loadFollowingStores();
  };

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      const [eligibleResult, mineResult] = await Promise.allSettled([
        reviewService.getEligibleReviews(),
        reviewService.getReviews(),
      ]);
      setPendingReviews(
        eligibleResult.status === 'fulfilled'
          ? eligibleResult.value.map(mapEligibleReview)
          : [],
      );
      setCompletedReviews(mineResult.status === 'fulfilled' ? mineResult.value : []);
      if (eligibleResult.status === 'rejected' && mineResult.status === 'rejected') {
        setReviewsError('Khong the tai danh sach danh gia.');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể tải danh sách đánh giá.';
      void message;
      setReviewsError('Khong the tai danh sach danh gia.');
      setPendingReviews([]);
      setCompletedReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  const openOrderDetail = (order: Order) => {
    const routeKey = resolveDetailRouteKey(order.code, order.id);
    if (!routeKey) return;
    navigate(`/profile/orders/${encodeURIComponent(routeKey)}`);
  };

  const loadOrders = useCallback(async () => {
    try {
      setOrdersLoading(true);
      setOrdersError(null);
      const rows = await orderService.listFromBackend();
      setAllOrders(rows);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể tải đơn hàng.';
      setOrdersError(message);
      setAllOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const syncAuthSession = useCallback((nextProfile: UserProfileRecord) => {
    const existingSession = authService.getSession() || authService.getAdminSession();
    if (!existingSession) return;

    const mergedUser = {
      ...existingSession.user,
      name: nextProfile.name || existingSession.user.name,
      email: nextProfile.email || existingSession.user.email,
      phone: nextProfile.phone || undefined,
      avatar: nextProfile.avatar || existingSession.user.avatar,
      role: nextProfile.role || existingSession.user.role,
      storeId: nextProfile.storeId || existingSession.user.storeId,
    };

    authService.updateSession(mergedUser);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      const nextProfile = await profileService.getMyProfile();
      setProfile(nextProfile);
      syncAuthSession(nextProfile);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể tải hồ sơ tài khoản.';
      setProfileError(message);
    } finally {
      setProfileLoading(false);
    }
  }, [syncAuthSession]);

  const loadAddresses = useCallback(async () => {
    try {
      setAddressesLoading(true);
      setAddressesError(null);
      const rows = await addressService.listFromBackend();
      setSavedAddresses(rows);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể tải danh sách địa chỉ.';
      setAddressesError(message);
      setSavedAddresses([]);
    } finally {
      setAddressesLoading(false);
    }
  }, []);

  const totalSpent = useMemo(
    () => allOrders
      .filter((order) => order.status === 'delivered')
      .reduce((sum, order) => sum + order.total, 0),
    [allOrders],
  );
  const pointsFromOrders = Math.round(totalSpent / 1000);

  const user = useMemo(() => {
    const name = profile?.name || authUser?.name || 'Khách hàng';
    const email = profile?.email || authUser?.email || '';
    const phone = profile?.phone || authUser?.phone || '';
    const avatar = profile?.avatar || authUser?.avatar || '';
    const dateOfBirthLabel = profile?.dateOfBirth
      ? new Date(`${profile.dateOfBirth}T00:00:00`).toLocaleDateString('vi-VN')
      : 'Chưa cập nhật';
    const loyaltyPoints = (profile?.loyaltyPoints ?? 0) > 0 ? (profile?.loyaltyPoints ?? 0) : pointsFromOrders;

    return {
      name,
      phone: phone || 'Chưa cập nhật',
      gender: GENDER_LABEL[profile?.gender || 'OTHER'],
      dob: dateOfBirthLabel,
      height: profile?.height ? `${profile.height} cm` : 'Chưa cập nhật',
      weight: profile?.weight ? `${profile.weight} kg` : 'Chưa cập nhật',
      email: email || 'Chưa cập nhật',
      avatar,
      totalSpent,
      points: loyaltyPoints,
      followingStoreCount: profile?.followingStoreCount ?? 0,
    };
  }, [authUser, pointsFromOrders, profile, totalSpent]);

  const currentTier = calculateTier(user.totalSpent);
  const nextTier = getNextTier(currentTier);
  const progress = getProgressToNextTier(user.totalSpent, currentTier);
  const requiredForNext = getSpendRequiredForNextTier(currentTier, user.totalSpent);
  const tierConfig = TIER_CONFIG[currentTier];
  const avatarImageSrc = resolveAvatarSrc(user.avatar);

  const tabs = [
    { id: 'account', label: t.tabs.account, icon: User },
    { id: 'orders', label: t.tabs.orders, icon: ShoppingBag },
    { id: 'reviews', label: t.tabs.reviews, icon: MessageSquare },
    { id: 'vouchers', label: t.tabs.vouchers, icon: Ticket },
    { id: 'addresses', label: t.tabs.addresses, icon: MapPin },
    { id: 'notifications', label: 'Thông báo', icon: Bell, badge: unreadCount > 0 ? unreadCount : undefined },
  ];

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    void loadProfile();
    void loadOrders();
  }, [loadOrders, loadProfile]);

  useEffect(() => {
    if (activeTab !== 'orders') {
      return;
    }
    void loadOrders();
  }, [activeTab, loadOrders]);

  useEffect(() => {
    if (activeTab !== 'addresses') {
      return;
    }
    void loadAddresses();
  }, [activeTab, loadAddresses]);

  useEffect(() => {
    if (activeTab !== 'vouchers') {
      return;
    }

    let cancelled = false;
    customerVoucherService.listAllWallet()
      .then((walletVouchers) => {
        if (!cancelled) {
          setVoucherWallet(walletVouchers);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVoucherWallet([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'vouchers') {
      return;
    }
    setVoucherPage(1);
  }, [activeTab]);

  useEffect(() => {
    setVoucherPage((current) => Math.min(current, totalVoucherPages));
  }, [totalVoucherPages]);

  useEffect(() => {
    if (activeTab !== 'reviews') {
      return;
    }
    void loadReviews();
  }, [activeTab, loadReviews]);

  useEffect(() => {
    if (!isAccountModalOpen) {
      return;
    }
    setAccountName(profile?.name || authUser?.name || '');
    setAccountPhone(profile?.phone || authUser?.phone || '');
    setAccountGender(profile?.gender || 'OTHER');
    setAccountDateOfBirth(profile?.dateOfBirth || '');
    setHeight(String(profile?.height ?? 163));
    setWeight(String(profile?.weight ?? 57));
  }, [authUser, isAccountModalOpen, profile]);

  useEffect(() => {
    const anyModalOpen =
      isAccountModalOpen ||
      isPasswordModalOpen ||
      isAddressModalOpen ||
      isReviewModalOpen ||
      isReturnDrawerOpen ||
      isFollowingModalOpen;
    if (anyModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  }, [isAccountModalOpen, isPasswordModalOpen, isAddressModalOpen, isReviewModalOpen, isFollowingModalOpen, isReturnDrawerOpen]);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isUploadingAvatar) return;

    const maxSize = 3 * 1024 * 1024;
    if (file.size > maxSize) {
      addToast('Ảnh đại diện không được vượt quá 3MB', 'error');
      return;
    }

    if (!file.type.startsWith('image/')) {
      addToast('Vui lòng chọn file ảnh (JPG, PNG, WEBP, GIF)', 'error');
      return;
    }

    try {
      setIsUploadingAvatar(true);
      const nextProfile = await profileService.uploadMyAvatar(file);
      setProfile(nextProfile);
      syncAuthSession(nextProfile);
      addToast('Đã cập nhật ảnh đại diện', 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể tải lên ảnh đại diện.';
      addToast(message, 'error');
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const handleLogout = () => {
    logout();
    addToast(CLIENT_TOAST_MESSAGES.auth.logoutSuccess, "info");
    navigate('/');
  };

  const closePasswordModal = () => {
    setIsPasswordModalOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowOldPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleAccountSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSavingProfile) return;

    try {
      setIsSavingProfile(true);
      const parsedHeight = Number(height);
      const parsedWeight = Number(weight);
      const nextProfile = await profileService.updateMyProfile({
        name: accountName,
        phone: accountPhone,
        gender: accountGender,
        dateOfBirth: accountDateOfBirth || null,
        height: Number.isFinite(parsedHeight) ? parsedHeight : null,
        weight: Number.isFinite(parsedWeight) ? parsedWeight : null,
      });
      setProfile(nextProfile);
      syncAuthSession(nextProfile);
      setIsAccountModalOpen(false);
      addToast('Đã cập nhật thông tin tài khoản', 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể cập nhật hồ sơ.';
      addToast(message, 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isChangingPassword) return;

    if (!currentPassword || !newPassword || !confirmPassword) {
      addToast('Vui lòng nhập đầy đủ thông tin mật khẩu.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('Mật khẩu mới và xác nhận mật khẩu chưa khớp.', 'error');
      return;
    }

    try {
      setIsChangingPassword(true);
      await profileService.changePassword({
        currentPassword,
        newPassword,
      });
      closePasswordModal();
      addToast('Đổi mật khẩu thành công', 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể đổi mật khẩu.';
      addToast(message, 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleRemoveAddress = async (addressId: string) => {
    if (isDeletingAddress) return;
    setIsDeletingAddress(true);
    try {
      await addressService.removeOnBackend(addressId);
      await loadAddresses();
      addToast('Đã xóa địa chỉ', 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể xóa địa chỉ.';
      addToast(message, 'error');
    } finally {
      setIsDeletingAddress(false);
      setPendingDeleteAddressId(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (isCancellingOrder) return;
    setIsCancellingOrder(true);
    try {
      await orderService.cancelOnBackend(orderId, 'Khách hàng hủy đơn');
      await loadOrders();
      addToast('Đã hủy đơn hàng thành công', 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể hủy đơn hàng.';
      addToast(message, 'error');
    } finally {
      setIsCancellingOrder(false);
      setPendingCancelOrderId(null);
    }
  };

  const handleMarkAllNotificationsRead = useCallback(() => {
    markAllAsRead();
    addToast(CLIENT_TOAST_MESSAGES.notifications.markedAllRead, 'success');
  }, [addToast, markAllAsRead]);

  const handleNotificationClick = useCallback((notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  }, [markAsRead, navigate]);

  const handleDeleteNotification = useCallback((notificationId: string) => {
    deleteNotification(notificationId);
    addToast(CLIENT_TOAST_MESSAGES.notifications.deleted, 'info');
  }, [addToast, deleteNotification]);

  return (
    <div className="profile-page">
      <div className="container">
        {/* Breadcrumbs */}
        <nav className="profile-breadcrumbs">
          <Link to="/">{tCommon.breadcrumb.home}</Link>
          <ChevronRight size={14} className="breadcrumb-separator" />
          <span className="current">{t.title}</span>
        </nav>

        {/* Loyalty Panel - Full Width at top */}
        <div className="loyalty-panel">
          <div className="loyalty-top">
            <div className="loyalty-left">
              <div
                className={`loyalty-avatar loyalty-avatar-upload${isUploadingAvatar ? ' uploading' : ''}`}
                onClick={() => avatarInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Thay đổi ảnh đại diện"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') avatarInputRef.current?.click(); }}
              >
                {avatarImageSrc ? (
                  <img src={avatarImageSrc} alt={user.name} />
                ) : (
                  <span>{(user.name.charAt(0) || 'U').toUpperCase()}</span>
                )}
                <div className="loyalty-avatar-overlay">
                  {isUploadingAvatar ? (
                    <div className="avatar-upload-spinner" />
                  ) : (
                    <Camera size={20} />
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarChange}
                  className="loyalty-avatar-input"
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
              <div className="loyalty-welcome">
                <span className="welcome-text">Xin chào</span>
                <span className="welcome-name">{user.name}!</span>
              </div>
            </div>
            <div className="loyalty-stats">
              <div className="loyalty-stat">
                <span className="stat-label">Hạng thành viên</span>
                <span
                  className="stat-value tier-badge"
                  style={{ backgroundColor: tierConfig.bg, color: tierConfig.color, borderColor: tierConfig.color }}
                >
                  {tierConfig.label}
                </span>
              </div>
              <div className="loyalty-stat">
                <span className="stat-label">Điểm tích lũy</span>
                <span className="stat-value points">{user.points.toLocaleString('vi-VN')} điểm</span>
              </div>
              <div className="loyalty-stat">
                <span className="stat-label">Shop đang theo dõi</span>
                <button
                  type="button"
                  className="stat-value loyalty-following-trigger"
                  onClick={handleOpenFollowingModal}
                >
                  {user.followingStoreCount.toLocaleString('vi-VN')}
                </button>
              </div>
            </div>
          </div>
          {nextTier && (
            <div className="loyalty-progress">
              <div className="progress-header">
                <span className="progress-label">Tiến đến {nextTier}</span>
                <span className="progress-percent">{Math.round(progress)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%`, backgroundColor: tierConfig.color }} />
              </div>
              <span className="progress-detail">Còn {formatPrice(requiredForNext)} đ để thăng hạng</span>
            </div>
          )}
        </div>

        <div className="profile-layout">
          {/* Sidebar */}
          <aside className="profile-sidebar">
            <ul className="profile-nav-list">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const hasBadge = tab.badge && tab.badge > 0;
                return (
                  <li key={tab.id} className="profile-nav-item">
                    <button
                      className={`profile-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                      onClick={() => handleTabChange(tab.id as TabId)}
                    >
                      <Icon className="profile-nav-icon" />
                      {tab.label}
                      {hasBadge && <span className="notif-tab-badge">{tab.badge}</span>}
                    </button>
                  </li>
                );
              })}

              <li className="profile-nav-item profile-nav-item-logout">
                <button className="profile-nav-btn profile-nav-btn-logout" onClick={handleLogout}>
                  <LogOut className="profile-nav-icon" />
                  {t.logout}
                </button>
              </li>
            </ul>
          </aside>

          {/* Main Content */}
          <main className="profile-content">
            {isLoading ? (
              <div className="profile-loading">
                <Skeleton type="text" width="40%" height={32} />
                <div className="profile-loading-rows">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="profile-loading-row">
                      <Skeleton type="text" width="30%" />
                      <Skeleton type="text" width="50%" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <ProfileTabContent
                activeTab={activeTab}
                user={user}
                profileLoading={profileLoading}
                profileError={profileError}
                orderFilter={orderFilter}
                onOrderFilterChange={setOrderFilter}
                orders={orders}
                ordersLoading={ordersLoading}
                ordersError={ordersError}
                orderPage={orderPage}
                ordersPerPage={ORDERS_PER_PAGE}
                onOrderPageChange={setOrderPage}
                orderStatusLabelMap={tCommon.status as Record<string, string>}
                onOpenOrderDetail={openOrderDetail}
                onRequestCancelOrder={setPendingCancelOrderId}
                vouchers={vouchers}
                pagedVouchers={pagedVouchers}
                voucherPage={voucherPage}
                totalVoucherPages={totalVoucherPages}
                vouchersPerPage={VOUCHERS_PER_PAGE}
                onVoucherPageChange={setVoucherPage}
                getVoucherMeta={getVoucherMeta}
                isMarketplaceVoucher={isMarketplaceVoucher}
                addressesLoading={addressesLoading}
                addressesError={addressesError}
                savedAddresses={savedAddresses}
                onAddAddress={handleAddAddress}
                onEditAddress={handleEditAddress}
                onRequestDeleteAddress={setPendingDeleteAddressId}
                reviewFilter={reviewFilter}
                onReviewFilterChange={setReviewFilter}
                pendingReviews={pendingReviews}
                completedReviews={completedReviews}
                reviewsLoading={reviewsLoading}
                reviewsError={reviewsError}
                pendingReviewPage={pendingReviewPage}
                completedReviewPage={completedReviewPage}
                reviewsPerPage={REVIEWS_PER_PAGE}
                onPendingReviewPageChange={setPendingReviewPage}
                onCompletedReviewPageChange={setCompletedReviewPage}
                getOrderDisplayCode={getOrderDisplayCode}
                onOpenReviewModal={handleOpenReviewModal}
                onOpenReturnDrawer={handleOpenReturnDrawer}
                onOpenReviewForOrder={handleOpenReviewForOrder}
                notifications={notifications}
                unreadCount={unreadCount}
                notificationPage={notificationPage}
                notificationsPerPage={NOTIFICATIONS_PER_PAGE}
                onNotificationPageChange={setNotificationPage}
                onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
                onNotificationClick={handleNotificationClick}
                onDeleteNotification={handleDeleteNotification}
                onOpenAccountModal={() => setIsAccountModalOpen(true)}
                onOpenPasswordModal={() => setIsPasswordModalOpen(true)}
              />
            )}
          </main>
        </div>
      </div>

      <ProfileAccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onSubmit={handleAccountSubmit}
        accountName={accountName}
        onAccountNameChange={setAccountName}
        accountPhone={accountPhone}
        onAccountPhoneChange={setAccountPhone}
        accountGender={accountGender}
        onAccountGenderChange={setAccountGender}
        accountDateOfBirth={accountDateOfBirth}
        onAccountDateOfBirthChange={setAccountDateOfBirth}
        height={height}
        onHeightChange={setHeight}
        weight={weight}
        onWeightChange={setWeight}
        isSavingProfile={isSavingProfile}
      />

      <ProfilePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={closePasswordModal}
        onSubmit={handlePasswordSubmit}
        currentPassword={currentPassword}
        onCurrentPasswordChange={setCurrentPassword}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        confirmPassword={confirmPassword}
        onConfirmPasswordChange={setConfirmPassword}
        showOldPassword={showOldPassword}
        onToggleShowOldPassword={() => setShowOldPassword((value) => !value)}
        showNewPassword={showNewPassword}
        onToggleShowNewPassword={() => setShowNewPassword((value) => !value)}
        showConfirmPassword={showConfirmPassword}
        onToggleShowConfirmPassword={() => setShowConfirmPassword((value) => !value)}
        isChangingPassword={isChangingPassword}
      />

      <ProfileFollowingModal
        isOpen={isFollowingModalOpen}
        onClose={closeFollowingModal}
        followingStoresLoading={followingStoresLoading}
        followingStoresError={followingStoresError}
        followingStores={followingStores}
      />

      {/* Address Modal */}
      <AddressModal
        isOpen={isAddressModalOpen}
        onClose={handleCloseAddressModal}
        onSave={loadAddresses}
        editingAddress={editingAddress}
        existingAddressCount={savedAddresses.length}
        addressesLoading={addressesLoading}
      />
      <ReturnRequestDrawer
        isOpen={isReturnDrawerOpen}
        order={returnOrder}
        onClose={() => {
          setIsReturnDrawerOpen(false);
          void loadOrders();
        }}
      />
      {/* Review Modal */}
      {reviewProduct && (
        <ReviewModal
          isOpen={isReviewModalOpen}
          onClose={handleCloseReviewModal}
          product={reviewProduct}
        />
      )}

      {/* Confirm Delete Address Modal */}
      <ConfirmModal
        isOpen={Boolean(pendingDeleteAddressId)}
        onClose={() => setPendingDeleteAddressId(null)}
        onConfirm={() => pendingDeleteAddressId && void handleRemoveAddress(pendingDeleteAddressId)}
        title="Xóa địa chỉ giao hàng"
        message="Bạn có chắc chắn muốn xóa địa chỉ này? Hành động này không thể hoàn tác."
        confirmText="Xóa địa chỉ"
        cancelText="Giữ lại"
        variant="danger"
        isLoading={isDeletingAddress}
      />

      {/* Confirm Cancel Order Modal */}
      <ConfirmModal
        isOpen={Boolean(pendingCancelOrderId)}
        onClose={() => setPendingCancelOrderId(null)}
        onConfirm={() => pendingCancelOrderId && void handleCancelOrder(pendingCancelOrderId)}
        title="Xác nhận hủy đơn hàng"
        message="Bạn có chắc chắn muốn hủy đơn hàng này? Sau khi hủy, đơn hàng sẽ không thể khôi phục."
        confirmText="Hủy đơn hàng"
        cancelText="Giữ đơn hàng"
        variant="danger"
        isLoading={isCancellingOrder}
      />
    </div>
  );
};

export default Profile;



