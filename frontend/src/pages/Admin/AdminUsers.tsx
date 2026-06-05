import './AdminUsers.css';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  Fingerprint,
  Mail,
  Phone,
  Ruler,
  Scale,
  ShieldCheck,
  Store,
  UserRound,
  X,
} from 'lucide-react';
import AdminLayout from './AdminLayout';
import AdminConfirmDialog from './AdminConfirmDialog';
import { AdminStateBlock } from './AdminStateBlocks';
import { PanelFilterSelect, PanelSearchField, PanelStatsGrid, PanelTableFooter } from '../../components/Panel/PanelPrimitives';
import { useToast } from '../../contexts/ToastContext';
import { adminUserService, type AdminUserRecord, type AdminUserRole, type AdminUserStatus } from '../../services/adminUserService';
import { getUiErrorMessage } from '../../utils/errorMessage';
import { resolveAvatarSrc } from '../../utils/avatar';
import Drawer from '../../components/Drawer/Drawer';
import { ADMIN_VIEW_KEYS } from './adminListView';
import { useAdminViewState } from './useAdminViewState';

type UserRoleFilter = 'all' | 'customer' | 'vendor' | 'admin';
type UserAccountStatusFilter = 'all' | 'active' | 'locked' | 'pendingVendor';
type UserRole = AdminUserRole;
type UserStatus = AdminUserStatus;
type UserRecord = AdminUserRecord & { note?: string };

type ConfirmState = {
  mode: 'lock' | 'unlock';
  ids: string[];
  selectedItems: string[];
};

const USER_ROLE_FILTERS: Array<{ key: UserRoleFilter; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'customer', label: 'Khách hàng' },
  { key: 'vendor', label: 'Người bán' },
  { key: 'admin', label: 'Quản trị viên' },
];

const USER_STATUS_FILTERS: Array<{ key: UserAccountStatusFilter; label: string }> = [
  { key: 'all', label: 'Tất cả tình trạng' },
  { key: 'active', label: 'Đang hoạt động' },
  { key: 'locked', label: 'Đã khóa' },
  { key: 'pendingVendor', label: 'Chờ duyệt vendor' },
];

const validUserStatusFilters = new Set<UserAccountStatusFilter>(USER_STATUS_FILTERS.map((item) => item.key));

const roleLabel = (role: UserRole) => {
  if (role === 'CUSTOMER') return 'Khách hàng';
  if (role === 'VENDOR') return 'Người bán';
  return 'Quản trị viên';
};

const genderLabel = (gender?: UserRecord['gender']) => {
  if (gender === 'MALE') return 'Nam';
  if (gender === 'FEMALE') return 'Nữ';
  if (gender === 'OTHER') return 'Khác';
  return 'Chưa cập nhật';
};

const formatDob = (dateOfBirth?: string) => {
  if (!dateOfBirth) return 'Chưa cập nhật';
  const parsed = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Chưa cập nhật';
  return parsed.toLocaleDateString('vi-VN');
};

const formatDate = (value?: string) => {
  if (!value) return 'Chưa cập nhật';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Chưa cập nhật';
  return parsed.toLocaleDateString('vi-VN');
};

const formatDateTime = (value?: string) => {
  if (!value) return 'Chưa cập nhật';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Chưa cập nhật';
  return parsed.toLocaleString('vi-VN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};


const formatVnd = (amount?: number) => {
  const safeAmount = Number.isFinite(amount) ? Number(amount) : 0;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

const statusLabel = (status: UserStatus) => {
  if (status === 'ACTIVE') return 'Đang hoạt động';
  if (status === 'LOCKED') return 'Đã khóa';
  return 'Chờ duyệt người bán';
};

const statusTone = (status: UserStatus) => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'LOCKED') return 'error';
  return 'pending';
};

const roleTone = (role: UserRole) => {
  if (role === 'CUSTOMER') return 'role-customer';
  if (role === 'VENDOR') return 'role-vendor';
  return 'role-admin';
};

const storeApprovalLabel = (status?: UserRecord['storeApprovalStatus']) => {
  if (status === 'APPROVED') return 'Đã duyệt';
  if (status === 'PENDING') return 'Chờ duyệt';
  if (status === 'REJECTED') return 'Từ chối';
  return 'Không áp dụng';
};

const storeApprovalTone = (status?: UserRecord['storeApprovalStatus']) => {
  if (status === 'APPROVED') return 'success';
  if (status === 'PENDING') return 'pending';
  if (status === 'REJECTED') return 'error';
  return '';
};

const storeStatusLabel = (status?: UserRecord['storeStatus']) => {
  if (status === 'ACTIVE') return 'Đang hoạt động';
  if (status === 'INACTIVE') return 'Ngừng hoạt động';
  if (status === 'SUSPENDED') return 'Tạm ngưng';
  return 'Không áp dụng';
};

const storeStatusTone = (status?: UserRecord['storeStatus']) => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'INACTIVE') return 'warning';
  if (status === 'SUSPENDED') return 'error';
  return '';
};

const canManageUser = (user: UserRecord) => user.role !== 'SUPER_ADMIN';

const getUserScope = (user: UserRecord) => {
  if (user.role === 'SUPER_ADMIN') {
    return {
      title: 'Toàn bộ marketplace',
      sub: 'Toàn quyền quản trị và giám sát hệ thống',
    };
  }

  if (user.role === 'VENDOR' || user.status === 'PENDING_VENDOR') {
    return {
      title: user.storeName || 'Chưa gắn gian hàng',
      sub: user.status === 'PENDING_VENDOR' ? 'Đang chờ duyệt onboarding vendor' : 'Đã kích hoạt vai trò người bán',
    };
  }

  return {
    title: 'Tài khoản người dùng',
    sub: 'Phạm vi mua sắm trên marketplace',
  };
};

const buildUserNote = (user: AdminUserRecord): string => {
  if (user.role === 'SUPER_ADMIN') return 'Tài khoản quản trị hệ thống';
  if (user.status === 'PENDING_VENDOR') return 'Đang chờ duyệt vendor onboarding';
  if (user.role === 'VENDOR') return 'Tài khoản vận hành gian hàng';
  return 'Tài khoản khách hàng';
};

const getUserInitial = (user: Pick<UserRecord, 'name' | 'email'>) => (user.name || user.email || 'U').trim().charAt(0).toUpperCase();

const renderUserAvatar = (
  user: Pick<UserRecord, 'name' | 'email' | 'avatar'>,
  options?: { large?: boolean },
) => {
  const avatar = resolveAvatarSrc(user.avatar);
  const className = options?.large ? 'user-avatar large' : 'user-avatar';

  return (
    <div className={className}>
      {avatar ? (
        <img
          src={avatar}
          alt={user.name ? `Ảnh đại diện ${user.name}` : 'Ảnh đại diện người dùng'}
          className="user-avatar-image"
        />
      ) : (
        <span>{getUserInitial(user)}</span>
      )}
    </div>
  );
};

const AdminUsers = () => {
  const { addToast } = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailUser, setDetailUser] = useState<UserRecord | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const pageSize = 8;
  const view = useAdminViewState({
    storageKey: ADMIN_VIEW_KEYS.customers,
    path: '/admin/users',
    validStatusKeys: USER_ROLE_FILTERS.map((tab) => tab.key),
    defaultStatus: 'all',
    extraFilters: [
      { key: 'account_status', defaultValue: 'all', validate: (value) => validUserStatusFilters.has(value as UserAccountStatusFilter) },
    ],
  });
  const roleFilter = (USER_ROLE_FILTERS.some((tab) => tab.key === view.status) ? view.status : 'all') as UserRoleFilter;
  const accountStatusFilter = (validUserStatusFilters.has(view.extras.account_status as UserAccountStatusFilter) ? view.extras.account_status : 'all') as UserAccountStatusFilter;
  const search = view.search;
  const page = view.page;

  useEffect(() => {
    let mounted = true;

    const loadUsers = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const data = await adminUserService.list();
        if (!mounted) return;
        setUsers((Array.isArray(data) ? data : []).map((user) => ({ ...user, note: buildUserNote(user) })));
      } catch (error: unknown) {
        if (!mounted) return;
        setUsers([]);
        setLoadError(getUiErrorMessage(error, 'Không tải được danh sách người dùng từ backend.'));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadUsers();
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  const filteredUsers = useMemo(() => {
    let next = users;

    if (roleFilter !== 'all') {
      next = next.filter((user) => {
        if (roleFilter === 'customer') return user.role === 'CUSTOMER';
        if (roleFilter === 'vendor') return user.role === 'VENDOR' || user.status === 'PENDING_VENDOR';
        return user.role === 'SUPER_ADMIN';
      });
    }

    if (accountStatusFilter !== 'all') {
      next = next.filter((user) => {
        if (accountStatusFilter === 'active') return user.status === 'ACTIVE';
        if (accountStatusFilter === 'locked') return user.status === 'LOCKED';
        return user.status === 'PENDING_VENDOR';
      });
    }

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      next = next.filter((user) =>
        `${user.name} ${user.email} ${user.phone || ''} ${user.storeName || ''} ${user.storeSlug || ''}`
          .toLowerCase()
          .includes(query),
      );
    }

    return next;
  }, [accountStatusFilter, roleFilter, search, users]);

  const counts = useMemo(
    () => ({
      all: users.length,
      customer: users.filter((user) => user.role === 'CUSTOMER').length,
      vendor: users.filter((user) => user.role === 'VENDOR' || user.status === 'PENDING_VENDOR').length,
      admin: users.filter((user) => user.role === 'SUPER_ADMIN').length,
      active: users.filter((user) => user.status === 'ACTIVE').length,
      locked: users.filter((user) => user.status === 'LOCKED').length,
      pendingVendor: users.filter((user) => user.status === 'PENDING_VENDOR').length,
    }),
    [users],
  );

  const totalPages = Math.max(Math.ceil(filteredUsers.length / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const pagedUsers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, safePage]);

  const resetCurrentView = () => {
    setSelected(new Set());
    setDetailUser(null);
    view.resetCurrentView();
  };

  const changeTab = (key: string) => {
    setSelected(new Set());
    setDetailUser(null);
    view.setStatus(key);
  };

  const changeAccountStatus = (key: string) => {
    setSelected(new Set());
    setDetailUser(null);
    view.setExtra('account_status', key);
  };

  const changeSearch = (value: string) => {
    setSelected(new Set());
    setDetailUser(null);
    view.setSearch(value);
  };

  const openConfirm = (mode: 'lock' | 'unlock', ids: string[]) => {
    const items = users.filter((user) => ids.includes(user.id));
    if (items.length === 0) return;
    setConfirmState({
      mode,
      ids: items.map((item) => item.id),
      selectedItems: items.map((item) => item.name),
    });
  };

  const applyStatusChange = async () => {
    if (!confirmState) return;

    setActionLoading(true);
    try {
      const shouldBeActive = confirmState.mode === 'unlock';
      const updated = await Promise.all(confirmState.ids.map((id) => adminUserService.updateActive(id, shouldBeActive)));
      const updatedMap = new Map(updated.map((item) => [item.id, { ...item, note: buildUserNote(item) }]));

      setUsers((prev) => prev.map((row) => updatedMap.get(row.id) || row));
      if (detailUser && updatedMap.has(detailUser.id)) {
        setDetailUser(updatedMap.get(detailUser.id) || null);
      }
      setSelected(new Set());
      setConfirmState(null);
      addToast(confirmState.mode === 'lock' ? 'Đã khóa tài khoản đã chọn' : 'Đã mở khóa tài khoản đã chọn', 'success');
    } catch (error: unknown) {
      addToast(getUiErrorMessage(error, 'Không thể cập nhật trạng thái tài khoản.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const detailScope = detailUser ? getUserScope(detailUser) : null;

  return (
    <AdminLayout title="Người dùng" breadcrumbs={['Người dùng', 'Khách hàng và người bán']}>
      <PanelStatsGrid
        items={[
          { key: 'all', label: 'Tổng tài khoản', value: counts.all, sub: 'Toàn bộ tài khoản đang theo dõi' },
          {
            key: 'customer',
            label: 'Khách hàng',
            value: counts.customer,
            sub: 'Tài khoản mua hàng trên sàn',
            tone: 'info',
            onClick: () => changeTab('customer'),
          },
          {
            key: 'vendor',
            label: 'Người bán',
            value: counts.vendor,
            sub: 'Bao gồm vendor đang bán và đang chờ duyệt',
            tone: 'success',
            onClick: () => changeTab('vendor'),
          },
          {
            key: 'locked',
            label: 'Đã khóa',
            value: counts.locked,
            sub: 'Tài khoản đang bị chặn đăng nhập',
            tone: counts.locked > 0 ? 'danger' : '',
            onClick: () => changeAccountStatus('locked'),
          },
        ]}
      />

      <section className="admin-panels single">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Danh sách người dùng</h2>
          </div>
          <div className="admin-filter-toolbar">
            <PanelSearchField
              placeholder="Tìm tên, email, số điện thoại hoặc gian hàng"
              ariaLabel="Tìm người dùng"
              value={search}
              onChange={changeSearch}
            />
            <PanelFilterSelect
              label="Vai trò"
              ariaLabel="Lọc người dùng theo vai trò"
              items={USER_ROLE_FILTERS.map((tab) => ({
                key: tab.key,
                label: tab.label,
                count: counts[tab.key],
              }))}
              value={roleFilter}
              onChange={changeTab}
            />
            <PanelFilterSelect
              label="Tình trạng"
              ariaLabel="Lọc người dùng theo tình trạng tài khoản"
              items={USER_STATUS_FILTERS.map((item) => ({
                key: item.key,
                label: item.label,
                count: counts[item.key],
              }))}
              value={accountStatusFilter}
              onChange={changeAccountStatus}
            />
            {view.hasViewContext ? (
              <button type="button" className="admin-filter-reset" onClick={resetCurrentView}>
                Đặt lại
              </button>
            ) : null}
          </div>

          {loading ? (
            <AdminStateBlock
              type="empty"
              title="Đang tải danh sách người dùng"
              description="Hệ thống đang đồng bộ dữ liệu từ backend."
            />
          ) : loadError ? (
            <AdminStateBlock
              type="empty"
              title="Không tải được dữ liệu người dùng"
              description={loadError}
              actionLabel="Thử lại"
              onAction={() => setReloadKey((key) => key + 1)}
            />
          ) : filteredUsers.length === 0 ? (
            <AdminStateBlock
              type={search.trim() ? 'search-empty' : 'empty'}
              title={search.trim() ? 'Không tìm thấy người dùng phù hợp' : 'Chưa có dữ liệu người dùng'}
              description={
                search.trim()
                  ? 'Thử đổi từ khóa hoặc đặt lại bộ lọc để xem lại danh sách người dùng.'
                  : 'Danh sách tài khoản khách hàng, người bán và quản trị sẽ xuất hiện tại đây để operator theo dõi.'
              }
              actionLabel="Đặt lại bộ lọc"
              onAction={resetCurrentView}
            />
          ) : (
            <>
              <div className="admin-table admin-responsive-table" role="table" aria-label="Bảng người dùng hệ sinh thái">
                <div className="admin-table-row users admin-table-head" role="row">
                  <div role="columnheader">
                    <input
                      type="checkbox"
                      checked={selected.size === filteredUsers.length && filteredUsers.length > 0}
                      onChange={(event) =>
                        setSelected(event.target.checked ? new Set(filteredUsers.map((item) => item.id)) : new Set())
                      }
                    />
                  </div>
                  <div role="columnheader">STT</div>
                  <div role="columnheader">Tài khoản</div>
                  <div role="columnheader">Vai trò</div>
                  <div role="columnheader">Tổng chi</div>
                  <div role="columnheader">Ngày tham gia</div>
                  <div role="columnheader">Trạng thái</div>
                  <div role="columnheader">Hành động</div>
                </div>

                {pagedUsers.map((user, index) => {
                  return (
                    <motion.div
                      key={user.id}
                      className="admin-table-row users"
                      role="row"
                      whileHover={{ y: -1 }}
                      onClick={() => setDetailUser(user)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div role="cell" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(user.id)}
                          onChange={(event) => {
                            const next = new Set(selected);
                            if (event.target.checked) next.add(user.id);
                            else next.delete(user.id);
                            setSelected(next);
                          }}
                        />
                      </div>
                      <div role="cell" className="admin-mono">{(safePage - 1) * pageSize + index + 1}</div>
                      <div role="cell" className="user-cell">
                        {renderUserAvatar(user)}
                        <div className="user-copy">
                          <div className="admin-bold">{user.name || 'Chưa cập nhật tên'}</div>
                          <div className="admin-muted small">{user.email}</div>
                        </div>
                      </div>
                      <div role="cell">
                        <span className={`admin-pill ${roleTone(user.role)}`}>{roleLabel(user.role)}</span>
                      </div>
                      <div role="cell" className="admin-bold">{formatVnd(user.totalSpent)}</div>
                      <div role="cell">{formatDate(user.createdAt)}</div>
                      <div role="cell">
                        <span className={`admin-pill ${statusTone(user.status)}`}>{statusLabel(user.status)}</span>
                      </div>
                      <div role="cell" className="admin-actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          className="admin-icon-btn subtle"
                          title="Xem hồ sơ"
                          aria-label="Xem hồ sơ"
                          onClick={() => setDetailUser(user)}
                        >
                          <Eye size={16} />
                        </button>
                        {canManageUser(user) &&
                          (user.status === 'LOCKED' ? (
                            <button
                              className="admin-icon-btn subtle success-icon"
                              title="Mở khóa tài khoản"
                              aria-label="Mở khóa tài khoản"
                              onClick={() => openConfirm('unlock', [user.id])}
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          ) : (
                            <button
                              className="admin-icon-btn subtle danger-icon"
                              title="Khóa tài khoản"
                              aria-label="Khóa tài khoản"
                              onClick={() => openConfirm('lock', [user.id])}
                            >
                              <Ban size={16} />
                            </button>
                          ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="admin-mobile-cards" aria-label="Danh sách người dùng dạng thẻ">
                {pagedUsers.map((user) => (
                  <article key={user.id} className="admin-mobile-card">
                    <div className="admin-mobile-card-head">
                      <div className="admin-mobile-card-title">
                        {renderUserAvatar(user)}
                        <div className="admin-mobile-card-title-main">
                          <p className="admin-bold">{user.name || 'Chưa cập nhật tên'}</p>
                          <p className="admin-mobile-card-sub">{user.email}</p>
                        </div>
                      </div>
                      <span className={`admin-pill ${statusTone(user.status)}`}>{statusLabel(user.status)}</span>
                    </div>
                    <div className="admin-mobile-card-grid">
                      <div className="admin-mobile-card-field">
                        <span>Vai trò</span>
                        <strong>{roleLabel(user.role)}</strong>
                        <p>{getUserScope(user).title}</p>
                      </div>
                      <div className="admin-mobile-card-field">
                        <span>Tổng chi</span>
                        <strong>{formatVnd(user.totalSpent)}</strong>
                      </div>
                      <div className="admin-mobile-card-field">
                        <span>Liên hệ</span>
                        <strong>{user.phone || 'Chưa cập nhật'}</strong>
                      </div>
                      <div className="admin-mobile-card-field">
                        <span>Ngày tham gia</span>
                        <strong>{formatDate(user.createdAt)}</strong>
                      </div>
                    </div>
                    <div className="admin-mobile-card-actions">
                      <button className="admin-primary-btn" type="button" onClick={() => setDetailUser(user)}>
                        <Eye size={16} />
                        Xem hồ sơ
                      </button>
                      {canManageUser(user) &&
                        (user.status === 'LOCKED' ? (
                          <button className="admin-icon-btn subtle success-icon" title="Mở khóa tài khoản" aria-label="Mở khóa tài khoản" onClick={() => openConfirm('unlock', [user.id])}>
                            <CheckCircle2 size={16} />
                          </button>
                        ) : (
                          <button className="admin-icon-btn subtle danger-icon" title="Khóa tài khoản" aria-label="Khóa tài khoản" onClick={() => openConfirm('lock', [user.id])}>
                            <Ban size={16} />
                          </button>
                        ))}
                    </div>
                  </article>
                ))}
              </div>

              <PanelTableFooter
                meta={`Hiển thị ${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, filteredUsers.length)} trên ${filteredUsers.length} tài khoản`}
                page={safePage}
                totalPages={totalPages}
                onPageChange={view.setPage}
                prevLabel="Trước"
                nextLabel="Sau"
              />
            </>
          )}
        </div>
      </section>

      <AdminConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.mode === 'lock' ? 'Khóa tài khoản người dùng' : 'Mở khóa tài khoản người dùng'}
        description={
          confirmState?.mode === 'lock'
            ? 'Tài khoản sẽ bị chặn đăng nhập cho đến khi được mở khóa lại.'
            : 'Tài khoản sẽ được phục hồi quyền đăng nhập theo vai trò hiện tại.'
        }
        selectedItems={confirmState?.selectedItems}
        selectedNoun="tài khoản"
        confirmLabel={actionLoading ? 'Đang xử lý...' : confirmState?.mode === 'lock' ? 'Xác nhận khóa' : 'Xác nhận mở khóa'}
        danger={confirmState?.mode === 'lock'}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          if (actionLoading) return;
          void applyStatusChange();
        }}
      />

      <Drawer
        open={Boolean(detailUser)}
        onClose={() => setDetailUser(null)}
        className="user-drawer"
        size="lg"
        ariaLabel="Hồ sơ người dùng"
      >
        {detailUser ? (
          <>
            <div className="drawer-header">
              <div>
                <p className="drawer-eyebrow">Hồ sơ người dùng</p>
                <h3>{detailUser.name || detailUser.email}</h3>
              </div>
              <button className="admin-icon-btn" onClick={() => setDetailUser(null)} aria-label="Đóng hồ sơ người dùng">
                <X size={16} />
              </button>
            </div>

            <div className="drawer-body">
              <section className="drawer-section">
                <h4>Tổng quan tài khoản</h4>
                <div className="user-drawer-hero">
                  {renderUserAvatar(detailUser, { large: true })}
                  <div className="user-hero-copy">
                    <div className="admin-bold">{detailUser.name || 'Chưa cập nhật tên'}</div>
                    <div className="admin-muted">{detailUser.email}</div>
                    <div className="admin-muted small">{detailScope?.title}</div>
                  </div>
                  <div className="user-pill-stack">
                    <span className={`admin-pill ${statusTone(detailUser.status)}`}>{statusLabel(detailUser.status)}</span>
                    <span className={`admin-pill ${roleTone(detailUser.role)}`}>{roleLabel(detailUser.role)}</span>
                  </div>
                </div>
              </section>

              <section className="drawer-section">
                <h4>Danh tính và liên hệ</h4>
                <div className="user-detail-grid">
                  <div className="user-detail-item">
                    <span className="user-detail-label">
                      <Mail size={14} />
                      Email
                    </span>
                    <strong className="user-detail-value">{detailUser.email}</strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">
                      <Phone size={14} />
                      Điện thoại
                    </span>
                    <strong className="user-detail-value">{detailUser.phone || 'Chưa cập nhật'}</strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">
                      <UserRound size={14} />
                      Giới tính
                    </span>
                    <strong className="user-detail-value">{genderLabel(detailUser.gender)}</strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">
                      <CalendarDays size={14} />
                      Ngày sinh
                    </span>
                    <strong className="user-detail-value">{formatDob(detailUser.dateOfBirth)}</strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">
                      <Ruler size={14} />
                      Chiều cao
                    </span>
                    <strong className="user-detail-value">
                      {detailUser.height && detailUser.height > 0 ? `${detailUser.height} cm` : 'Chưa cập nhật'}
                    </strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">
                      <Scale size={14} />
                      Cân nặng
                    </span>
                    <strong className="user-detail-value">
                      {detailUser.weight && detailUser.weight > 0 ? `${detailUser.weight} kg` : 'Chưa cập nhật'}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="drawer-section">
                <h4>Thông tin nghiệp vụ</h4>
                <div className="user-signal-grid">
                  <div className="user-signal-card">
                    <span className="admin-muted small">Điểm tích lũy</span>
                    <strong>{(detailUser.loyaltyPoints ?? 0).toLocaleString('vi-VN')} điểm</strong>
                  </div>
                  <div className="user-signal-card">
                    <span className="admin-muted small">Đăng nhập</span>
                    <strong>{detailUser.isActive ? 'Cho phép' : 'Bị chặn'}</strong>
                  </div>
                  <div className="user-signal-card">
                    <span className="admin-muted small">Account status</span>
                    <strong>{statusLabel(detailUser.status)}</strong>
                  </div>
                </div>
              </section>

              <section className="drawer-section">
                <h4>Gian hàng liên kết</h4>
                <div className="user-detail-grid">
                  <div className="user-detail-item">
                    <span className="user-detail-label">
                      <Store size={14} />
                      Tên gian hàng
                    </span>
                    <strong className="user-detail-value">{detailUser.storeName || 'Chưa liên kết'}</strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">Store slug</span>
                    <strong className="user-detail-value mono">{detailUser.storeSlug || '-'}</strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">Store ID</span>
                    <strong className="user-detail-value mono">{detailUser.storeId || '-'}</strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">Duyệt gian hàng</span>
                    <strong className="user-detail-value">
                      <span className={`admin-pill ${storeApprovalTone(detailUser.storeApprovalStatus)}`}>
                        {storeApprovalLabel(detailUser.storeApprovalStatus)}
                      </span>
                    </strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">Trạng thái gian hàng</span>
                    <strong className="user-detail-value">
                      <span className={`admin-pill ${storeStatusTone(detailUser.storeStatus)}`}>
                        {storeStatusLabel(detailUser.storeStatus)}
                      </span>
                    </strong>
                  </div>
                </div>
              </section>

              <section className="drawer-section">
                <h4>Dấu thời gian hệ thống</h4>
                <div className="user-detail-grid">
                  <div className="user-detail-item">
                    <span className="user-detail-label">
                      <Fingerprint size={14} />
                      User ID
                    </span>
                    <strong className="user-detail-value mono">{detailUser.id}</strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">
                      <CalendarDays size={14} />
                      Ngày tạo
                    </span>
                    <strong className="user-detail-value">{formatDateTime(detailUser.createdAt)}</strong>
                  </div>
                  <div className="user-detail-item">
                    <span className="user-detail-label">
                      <Clock3 size={14} />
                      Cập nhật gần nhất
                    </span>
                    <strong className="user-detail-value">{formatDateTime(detailUser.updatedAt)}</strong>
                  </div>
                </div>
              </section>

              <section className="drawer-section">
                <h4>Ghi chú vận hành</h4>
                <p className="admin-muted user-note">{detailUser.note || 'Chưa có ghi chú nội bộ cho tài khoản này.'}</p>
              </section>
            </div>

            <div className="drawer-footer">
              <button className="admin-ghost-btn" onClick={() => setDetailUser(null)}>
                Đóng
              </button>
              {canManageUser(detailUser) ? (
                detailUser.status === 'LOCKED' ? (
                  <button className="admin-primary-btn" onClick={() => openConfirm('unlock', [detailUser.id])}>
                    <ShieldCheck size={14} />
                    Mở khóa tài khoản
                  </button>
                ) : (
                  <button className="admin-ghost-btn danger" onClick={() => openConfirm('lock', [detailUser.id])}>
                    <Ban size={14} />
                    Khóa tài khoản
                  </button>
                )
              ) : (
                <span className="admin-muted small">Tài khoản SUPER_ADMIN không thể bị khóa.</span>
              )}
            </div>
          </>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
};

export default AdminUsers;
