import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Heart, Menu, X, ChevronDown, Bell, Store, LayoutGrid, Camera } from 'lucide-react';
import SearchDropdown from '../SearchDropdown/SearchDropdown';
import HeaderImageSearchModal from './HeaderImageSearchModal';
import NotificationDropdown from '../NotificationDropdown/NotificationDropdown';
import { useCartAnimation } from '../../context/CartAnimationContext';
import { useCart } from '../../contexts/CartContext';
import { useWishlist } from '../../contexts/WishlistContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { searchService } from '../../services/searchService';
import {
  marketplaceService,
  type MarketplaceHeaderCategoryRoot,
} from '../../services/marketplaceService';
import { CLIENT_TEXT } from '../../utils/texts';
import { CLIENT_TOAST_MESSAGES } from '../../utils/clientMessages';
import { resolveAvatarSrc } from '../../utils/avatar';
import { useHeaderImageSearch } from '../../hooks/useHeaderImageSearch';
import './Header.css';

type SearchScope = 'products' | 'stores';

const FALLBACK_HEADER_CATEGORY_TREE: MarketplaceHeaderCategoryRoot[] = [
  {
    id: 'nam',
    label: 'NAM',
    slug: 'men',
    children: [
      {
        id: 'men-ao',
        name: 'Áo nam',
        slug: 'men-ao',
        children: [
          { id: 'men-ao-thun', name: 'Áo thun nam', slug: 'men-ao-thun' },
          { id: 'men-ao-polo', name: 'Áo polo nam', slug: 'men-ao-polo' },
          { id: 'men-ao-so-mi', name: 'Áo sơ mi nam', slug: 'men-ao-so-mi' },
          { id: 'men-ao-hoodie', name: 'Áo hoodie nam', slug: 'men-ao-hoodie' },
        ],
      },
      {
        id: 'men-quan',
        name: 'Quần nam',
        slug: 'men-quan',
        children: [
          { id: 'men-quan-jeans', name: 'Quần jeans nam', slug: 'men-quan-jeans' },
          { id: 'men-quan-tay', name: 'Quần tây nam', slug: 'men-quan-tay' },
          { id: 'men-quan-kaki', name: 'Quần kaki nam', slug: 'men-quan-kaki' },
          { id: 'men-quan-short', name: 'Quần short nam', slug: 'men-quan-short' },
        ],
      },
      {
        id: 'men-do-the-thao',
        name: 'Đồ thể thao nam',
        slug: 'men-do-the-thao',
        children: [
          { id: 'men-ao-the-thao', name: 'Áo thể thao nam', slug: 'men-ao-the-thao' },
          { id: 'men-quan-the-thao', name: 'Quần thể thao nam', slug: 'men-quan-the-thao' },
          { id: 'men-set-the-thao', name: 'Set thể thao nam', slug: 'men-set-the-thao' },
        ],
      },
    ],
  },
  {
    id: 'nu',
    label: 'NỮ',
    slug: 'women',
    children: [
      {
        id: 'women-ao',
        name: 'Áo nữ',
        slug: 'women-ao',
        children: [
          { id: 'women-ao-thun', name: 'Áo thun nữ', slug: 'women-ao-thun' },
          { id: 'women-ao-kieu', name: 'Áo kiểu nữ', slug: 'women-ao-kieu' },
          { id: 'women-ao-so-mi', name: 'Áo sơ mi nữ', slug: 'women-ao-so-mi' },
          { id: 'women-ao-khoac', name: 'Áo khoác nữ', slug: 'women-ao-khoac' },
        ],
      },
      {
        id: 'women-vay-dam',
        name: 'Váy đầm nữ',
        slug: 'women-vay-dam',
        children: [
          { id: 'women-vay-lien', name: 'Váy liền nữ', slug: 'women-vay-lien' },
          { id: 'women-vay-du-tiec', name: 'Váy dự tiệc nữ', slug: 'women-vay-du-tiec' },
          { id: 'women-vay-cong-so', name: 'Váy công sở nữ', slug: 'women-vay-cong-so' },
        ],
      },
      {
        id: 'women-quan',
        name: 'Quần nữ',
        slug: 'women-quan',
        children: [
          { id: 'women-quan-jeans', name: 'Quần jeans nữ', slug: 'women-quan-jeans' },
          { id: 'women-quan-short', name: 'Quần short nữ', slug: 'women-quan-short' },
          { id: 'women-quan-tay', name: 'Quần tây nữ', slug: 'women-quan-tay' },
          { id: 'women-quan-legging', name: 'Quần legging nữ', slug: 'women-quan-legging' },
        ],
      },
    ],
  },
  {
    id: 'phu-kien',
    label: 'PHỤ KIỆN',
    slug: 'accessories',
    children: [
      {
        id: 'accessories-tui-va-vi',
        name: 'Túi và ví',
        slug: 'accessories-tui-va-vi',
        children: [
          { id: 'tui-xach', name: 'Túi xách', slug: 'tui-xach' },
          { id: 'tui-deo-cheo', name: 'Túi đeo chéo', slug: 'tui-deo-cheo' },
          { id: 'balo', name: 'Balo', slug: 'balo' },
          { id: 'vi', name: 'Ví', slug: 'vi' },
        ],
      },
      {
        id: 'accessories-phu-kien-thoi-trang',
        name: 'Phụ kiện thời trang',
        slug: 'accessories-phu-kien-thoi-trang',
        children: [
          { id: 'non-mu', name: 'Nón mũ', slug: 'non-mu' },
          { id: 'that-lung', name: 'Thắt lưng', slug: 'that-lung' },
          { id: 'khan', name: 'Khăn', slug: 'khan' },
          { id: 'tat', name: 'Tất', slug: 'tat' },
        ],
      },
    ],
  },
];

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { totalItems } = useCart();
  const { totalItems: wishlistCount } = useWishlist();
  const { cartIconRef, wishlistIconRef } = useCartAnimation();
  const [searchValue, setSearchValue] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedMobileMenu, setExpandedMobileMenu] = useState<string | null>(null);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const avatarImageSrc = resolveAvatarSrc(user?.avatar);
  const { addToast } = useToast();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const { unreadCount, markAllAsRead } = useNotifications();
  const [searchScope, setSearchScope] = useState<SearchScope>('products');
  const [categoryTree, setCategoryTree] = useState<MarketplaceHeaderCategoryRoot[]>(FALLBACK_HEADER_CATEGORY_TREE);

  const toggleMobileSubMenu = (menuId: string) => {
    setExpandedMobileMenu((prev) => (prev === menuId ? null : menuId));
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    setExpandedMobileMenu(null);
  };

  const [isBouncing, setIsBouncing] = useState(false);
  const prevItemsRef = React.useRef(totalItems);

  React.useEffect(() => {
    if (totalItems > prevItemsRef.current) {
      setIsBouncing(true);
      setTimeout(() => setIsBouncing(false), 300);
    }
    prevItemsRef.current = totalItems;
  }, [totalItems]);

  React.useEffect(() => {
    let mounted = true;

    const loadCategoryTree = async () => {
      const rows = await marketplaceService.getHeaderCategoryTree();
      if (mounted && rows.length > 0) {
        setCategoryTree(rows);
      }
    };

    void loadCategoryTree();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSearchSubmit = (query: string, scope: SearchScope = searchScope) => {
    if (query.trim()) {
      searchService.addToHistory(query);
      setSearchValue(query);
      const params = new URLSearchParams();
      params.set('q', query.trim());
      params.set('scope', scope);
      navigate(`/search?${params.toString()}`);
      setIsSearchDropdownOpen(false);
    }
  };

  const {
    imageInputRef,
    isImageSearchModalOpen,
    imageSearchDraft,
    openImageSearchModal,
    closeImageSearchModal,
    triggerImagePicker,
    handleImageInputChange,
    handleModalPaste,
    handleImageSearchConfirm,
  } = useHeaderImageSearch({
    pathname: location.pathname,
    navigate,
    closeMobileMenu,
    closeSearchDropdown: () => setIsSearchDropdownOpen(false),
    setSearchScope: (scope) => setSearchScope(scope),
    addToast,
  });

  const toCategoryLink = (slug?: string) => {
    const normalized = (slug || '').trim();
    if (!normalized) {
      return '/category/all';
    }
    return `/category/${encodeURIComponent(normalized)}`;
  };

  const handleGoToCart = () => {
    if (location.pathname === '/cart') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      return;
    }
    navigate('/cart');
  };

  const handleOpenNotifications = () => {
    if (unreadCount > 0) {
      markAllAsRead();
    }
    setIsNotificationOpen(true);
  };

  return (
    <header className="header">
      <div className="header-container container">
        <div className="header-logo">
          <Link to="/">
            <img
              src="/brand/pho-mac-logo.png"
              alt="Phố Mặc"
              className="logo-image"
              width={200}
              height={50}
            />
          </Link>
        </div>

        <nav className="header-nav">
          <ul className="nav-list">
            {categoryTree.map((root) => (
              <li key={root.id} className="nav-item has-mega-menu">
                <Link to={toCategoryLink(root.slug)} className="nav-link">{root.label}</Link>
                <div className="mega-menu">
                  <div className="mega-menu-content">
                    {root.children.map((group) => (
                      <div key={group.id} className="mega-menu-col">
                        <h3 className="mega-menu-title">{group.name}</h3>
                        <ul className="mega-menu-list">
                          {(group.children.length > 0
                            ? group.children
                            : [{ id: `${group.id}-all`, name: `Tất cả ${group.name}`, slug: group.slug }]
                          ).map((leaf) => (
                            <li key={leaf.id}>
                              <Link to={toCategoryLink(leaf.slug)}>{leaf.name}</Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            ))}
            <li>
              <Link to="/category/sale" className="nav-link nav-sale">
                SALE
              </Link>
            </li>
          </ul>
        </nav>

        <div className="header-actions">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="header-image-input"
            onChange={handleImageInputChange}
          />
          <form className="search-box" onSubmit={(e) => { e.preventDefault(); handleSearchSubmit(searchValue); }}>
            <label className="search-scope-wrap" htmlFor="header-search-scope">
              <select
                id="header-search-scope"
                className="search-scope"
                value={searchScope}
                onChange={(event) => setSearchScope(event.target.value as SearchScope)}
                aria-label="Bộ lọc tìm kiếm"
              >
                <option value="products">Sản phẩm</option>
                <option value="stores">Cửa hàng</option>
              </select>
            </label>
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder={searchScope === 'stores' ? 'Tìm tên cửa hàng...' : CLIENT_TEXT.search.dropdown.placeholder}
              className="search-input"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onFocus={() => setIsSearchDropdownOpen(true)}
              aria-label={CLIENT_TEXT.common.actions.search}
            />
            <button
              type="button"
              className="search-image-btn"
              onClick={openImageSearchModal}
              aria-label="Tìm kiếm bằng hình ảnh"
              title="Tìm kiếm bằng hình ảnh"
            >
              <Camera size={18} />
            </button>
            <SearchDropdown
              isOpen={isSearchDropdownOpen}
              onClose={() => setIsSearchDropdownOpen(false)}
              inputValue={searchValue}
              onSearch={handleSearchSubmit}
            />
          </form>
          <div className="auth-links">
            {!isAuthenticated ? (
              <div className="auth-links">
                <Link to="/login" className="auth-link">Đăng nhập</Link>
                <span className="auth-divider">/</span>
                <Link to="/register" className="auth-link">Đăng ký</Link>
              </div>
            ) : (
              <div
                className="account-menu"
                onMouseEnter={() => setIsAccountMenuOpen(true)}
                onMouseLeave={() => setIsAccountMenuOpen(false)}
              >
                <button
                  className="account-toggle"
                  onClick={() => navigate('/profile')}
                >
	                  <div className="account-avatar">
	                    {avatarImageSrc ? (
	                      <img src={avatarImageSrc} alt={user?.name || 'Avatar'} />
	                    ) : (
	                      user?.name?.charAt(0).toUpperCase() || 'U'
	                    )}
	                  </div>
                  <span className="account-name">{user?.name || 'Tài khoản'}</span>
                </button>
                <div className={`account-dropdown ${isAccountMenuOpen ? 'show' : ''}`}>
                  <button className="account-item" onClick={() => { navigate('/profile'); setIsAccountMenuOpen(false); }}>
                    {CLIENT_TEXT.profile.tabs.account}
                  </button>
                  <button className="account-item" onClick={() => { navigate('/profile?tab=orders'); setIsAccountMenuOpen(false); }}>
                    {CLIENT_TEXT.profile.tabs.orders}
                  </button>
                  <button className="account-item" onClick={() => { navigate('/profile?tab=vouchers'); setIsAccountMenuOpen(false); }}>
                    {CLIENT_TEXT.profile.tabs.vouchers}
                  </button>
                  <button className="account-item" onClick={() => { navigate('/profile?tab=addresses'); setIsAccountMenuOpen(false); }}>
                    {CLIENT_TEXT.profile.tabs.addresses}
                  </button>
                  <button className="account-item" onClick={() => { navigate('/profile?tab=reviews'); setIsAccountMenuOpen(false); }}>
                    {CLIENT_TEXT.profile.tabs.reviews}
                  </button>

                  {(user?.role === 'VENDOR' || user?.role === 'SUPER_ADMIN') && (
                    <>
                      <div className="account-dropdown-divider"></div>
                      <div className="portal-switcher-label">Chuyển kênh</div>
                      {user?.role === 'VENDOR' && (
                        <button className="account-item portal-item" onClick={() => { navigate('/vendor/dashboard'); setIsAccountMenuOpen(false); }}>
                          <span>Kênh Người Bán</span>
                          {!user?.isApprovedVendor && <span className="portal-badge pending">Chờ duyệt</span>}
                        </button>
                      )}
                      {user?.role === 'SUPER_ADMIN' && (
                        <button className="account-item portal-item" onClick={() => { navigate('/admin'); setIsAccountMenuOpen(false); }}>
                          <span>Quản Trị Sàn</span>
                        </button>
                      )}
                    </>
                  )}

                  <div className="account-dropdown-divider"></div>
                  <button className="account-item logout" onClick={() => { logout(); addToast(CLIENT_TOAST_MESSAGES.auth.logoutSuccess, 'info'); setIsAccountMenuOpen(false); navigate('/'); }}>
                    Đăng xuất
                  </button>
                </div>
              </div>
            )}
          </div>

          {isAuthenticated && (user?.role === 'VENDOR' || user?.role === 'SUPER_ADMIN') && (
            <button
              className={`portal-quick-btn ${user?.role?.toLowerCase()}`}
              onClick={() => navigate(user?.role === 'SUPER_ADMIN' ? '/admin' : '/vendor/dashboard')}
              title={user?.role === 'SUPER_ADMIN' ? 'Quản trị sàn' : 'Kênh người bán'}
            >
              {user?.role === 'SUPER_ADMIN' ? <LayoutGrid size={18} /> : <Store size={18} />}
            </button>
          )}

          <button ref={wishlistIconRef} className="icon-btn wishlist-btn" aria-label="Yêu thích" onClick={() => navigate('/wishlist')}>
            <Heart size={22} />
            {wishlistCount > 0 && <span className="icon-badge">{wishlistCount > 99 ? '99+' : wishlistCount}</span>}
          </button>
          <button
            ref={cartIconRef}
            className={`icon-btn cart-btn ${isBouncing ? 'icon-bounce' : ''}`}
            aria-label="Giỏ hàng"
            onClick={handleGoToCart}
          >
            <ShoppingCart size={22} />
            {totalItems > 0 && <span className="icon-badge">{totalItems > 99 ? '99+' : totalItems}</span>}
          </button>
          {isAuthenticated && (
            <div className="notification-menu">
              <button
                className="icon-btn notification-btn"
                aria-label="Thông báo"
                onClick={handleOpenNotifications}
              >
                <Bell size={22} />
                {unreadCount > 0 && <span className="icon-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>
              <NotificationDropdown
                isOpen={isNotificationOpen}
                onClose={() => setIsNotificationOpen(false)}
              />
            </div>
          )}

        </div>
        <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Menu">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {isMobileMenuOpen && <button className="mobile-overlay" onClick={closeMobileMenu} aria-label="Đóng menu" />}

      <div className={`mobile-drawer ${isMobileMenuOpen ? 'open' : ''}`}>
        <form className="mobile-search" onSubmit={(e) => { e.preventDefault(); if (searchValue.trim()) { handleSearchSubmit(searchValue); closeMobileMenu(); } }}>
          <select
            className="mobile-search-scope"
            value={searchScope}
            onChange={(event) => setSearchScope(event.target.value as SearchScope)}
            aria-label="Bộ lọc tìm kiếm"
          >
            <option value="products">Sản phẩm</option>
            <option value="stores">Cửa hàng</option>
          </select>
          <Search size={18} />
          <input
            type="text"
            placeholder={searchScope === 'stores' ? 'Tìm cửa hàng...' : 'Tìm kiếm sản phẩm...'}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
          <button
            type="button"
            className="mobile-search-image-btn"
            onClick={openImageSearchModal}
            aria-label="Tìm kiếm bằng hình ảnh"
          >
            <Camera size={18} />
          </button>
        </form>

        <nav className="mobile-nav">
          {categoryTree.map((root) => (
            <div className="mobile-nav-group" key={root.id}>
              <button
                className="mobile-nav-link"
                onClick={() => toggleMobileSubMenu(root.id)}
                aria-label={`Danh mục ${root.label}`}
              >
                {root.label}
                <ChevronDown
                  size={16}
                  className={expandedMobileMenu === root.id ? 'rotated' : ''}
                  aria-hidden="true"
                />
              </button>
              {expandedMobileMenu === root.id && (
                <div className="mobile-sub-menu">
                  <Link to={toCategoryLink(root.slug)} className="mobile-sub-menu-root" onClick={closeMobileMenu}>
                    {`Tất cả ${root.label}`}
                  </Link>
                  {root.children.map((group) => (
                    <div key={group.id} className="mobile-sub-menu-group">
                      <Link to={toCategoryLink(group.slug)} className="mobile-sub-menu-group-title" onClick={closeMobileMenu}>
                        {group.name}
                      </Link>
                      {(group.children.length > 0
                        ? group.children
                        : [{ id: `${group.id}-all`, name: `Tất cả ${group.name}`, slug: group.slug }]
                      ).map((leaf) => (
                        <Link
                          key={leaf.id}
                          to={toCategoryLink(leaf.slug)}
                          className="mobile-sub-menu-child"
                          onClick={closeMobileMenu}
                        >
                          {leaf.name}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <Link to="/category/sale" className="mobile-nav-link mobile-sale" onClick={closeMobileMenu}>SALE</Link>
        </nav>

        <div className="mobile-auth">
          {!isAuthenticated ? (
            <>
              <button className="mobile-auth-btn" onClick={() => { navigate('/login'); closeMobileMenu(); }}>Đăng nhập</button>
              <button className="mobile-auth-btn mobile-auth-register" onClick={() => { navigate('/register'); closeMobileMenu(); }}>Đăng ký</button>
            </>
          ) : (
            <>
              <div className="mobile-user-info">
	                <div className="mobile-user-avatar">
	                  {avatarImageSrc ? (
	                    <img src={avatarImageSrc} alt={user?.name || 'Avatar'} />
	                  ) : (
	                    user?.name?.charAt(0).toUpperCase() || 'U'
	                  )}
	                </div>
                <div className="mobile-user-details">
                  <span className="mobile-user-name">{user?.name}</span>
                  <span className="mobile-user-email">{user?.email}</span>
                </div>
              </div>
              <Link to="/profile" className="mobile-auth-btn" onClick={closeMobileMenu}>Tài khoản</Link>
              {user?.role === 'VENDOR' && (
                <Link to="/vendor/dashboard" className="mobile-auth-btn mobile-auth-admin" onClick={closeMobileMenu}>🏪 Kênh Người Bán</Link>
              )}
              {user?.role === 'SUPER_ADMIN' && (
                <Link to="/admin" className="mobile-auth-btn mobile-auth-admin" onClick={closeMobileMenu}>⚡ Quản Trị Sàn</Link>
              )}
              <button className="mobile-auth-btn mobile-auth-register" onClick={() => { logout(); addToast(CLIENT_TOAST_MESSAGES.auth.logoutSuccess, 'info'); closeMobileMenu(); }}>Đăng xuất</button>
            </>
          )}
        </div>

        <div className="mobile-quick-links">
          <Link to="/wishlist" onClick={closeMobileMenu}><Heart size={18} /> Yêu thích {wishlistCount > 0 && `(${wishlistCount})`}</Link>
          <Link to={isAuthenticated ? '/profile?tab=orders' : '/login'} onClick={closeMobileMenu}><Search size={18} /> Đơn hàng</Link>
          <Link to="/order-tracking" onClick={closeMobileMenu}><Search size={18} /> Theo dõi đơn</Link>
          <Link to="/returns" onClick={closeMobileMenu}><Search size={18} /> Đổi / Trả hàng</Link>
        </div>
      </div>
      <HeaderImageSearchModal
        isOpen={isImageSearchModalOpen}
        imageSearchDraft={imageSearchDraft}
        onClose={closeImageSearchModal}
        onPickImage={triggerImagePicker}
        onPaste={handleModalPaste}
        onConfirm={handleImageSearchConfirm}
      />
    </header>
  );
};

export default Header;



