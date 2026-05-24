import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Clock, Search as SearchIcon, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import FilterSidebar from '../../components/FilterSidebar/FilterSidebar';
import ProductGrid from '../../components/ProductGrid/ProductGrid';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import SearchImageLandingHero from './components/SearchImageLandingHero';
import SearchImageQueryPanel from './components/SearchImageQueryPanel';
import { searchService } from '../../services/searchService';
import { CLIENT_TEXT } from '../../utils/texts';
import { useClientViewState } from '../../hooks/useClientViewState';
import {
  marketplaceService,
  type MarketplaceFlashSaleItem,
  type MarketplaceStoreCard,
} from '../../services/marketplaceService';
import type { Product } from '../../types';
import {
  collectFilterFacets,
  filterProducts,
  type ProductFilterState,
} from '../../utils/productFilters';
import { useSearchImageFlow } from './hooks/useSearchImageFlow';
import { usePageTitle } from '../../hooks/usePageTitle';
import './Search.css';

const t = CLIENT_TEXT.search;
type SearchScope = 'products' | 'stores';

const mapFlashSaleItemsToProducts = (items: MarketplaceFlashSaleItem[]): Product[] =>
  (items || []).map((item) => {
    const availableStock = Math.max(0, Number(item.totalStock || 0) - Number(item.soldCount || 0));
    const variants = (item.variants || [])
      .filter((variant) => String(variant.size || '').trim().length > 0)
      .map((variant, index) => ({
        id: String(variant.backendId || `${String(item.id)}-v${index + 1}`),
        backendId: variant.backendId,
        size: String(variant.size || '').trim(),
        color: String(variant.color || '').trim(),
        colorHex: variant.colorHex,
        sku: String(variant.backendId || `${String(item.id)}-v${index + 1}`),
        price: Number(item.price || 0),
        stock: availableStock,
      }));

    return {
      id: item.id,
      sku: String(item.backendProductId || item.id),
      name: item.name,
      category: 'Flash Sale',
      price: Number(item.price || 0),
      originalPrice: item.originalPrice,
      image: item.image,
      badge: item.badge || 'FLASH SALE',
      colors: item.colors || [],
      sizes: item.sizes || [],
      stock: availableStock,
      status: 'ACTIVE',
      statusType: availableStock <= 0 ? 'out' : availableStock < 10 ? 'low' : 'active',
      variants: variants.length > 0 ? variants : undefined,
      backendId: item.backendProductId,
      storeId: item.storeId,
      storeName: item.storeName,
      storeSlug: item.storeSlug,
      isOfficialStore: Boolean(item.isOfficialStore),
    };
  });

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const scope: SearchScope = searchParams.get('scope') === 'stores' ? 'stores' : 'products';
  const isFlashSaleMode = searchParams.get('flashSale') === '1';
  const imageSearchToken = searchParams.get('imageSearch') || '';
  const imageCategory = (searchParams.get('imageCategory') || '').trim();
  const imageStore = (searchParams.get('imageStore') || '').trim();
  const pageTitle = useMemo(() => {
    if (imageSearchToken) {
      return 'Tìm kiếm bằng ảnh';
    }

    if (isFlashSaleMode) {
      return 'Flash Sale';
    }

    if (query && scope === 'stores') {
      return `Tìm cửa hàng "${query}"`;
    }

    if (query) {
      return `Tìm kiếm "${query}"`;
    }

    return 'Tìm kiếm';
  }, [imageSearchToken, isFlashSaleMode, query, scope]);
  usePageTitle(pageTitle);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [storeResults, setStoreResults] = useState<MarketplaceStoreCard[]>([]);
  const [history, setHistory] = useState<string[]>(() => searchService.getRecentSearches());
  const view = useClientViewState({
    validSortKeys: ['relevance', 'newest', 'bestseller', 'price-asc', 'price-desc', 'discount'],
  });

  const clearSearchResults = useCallback(() => {
    setProductResults([]);
    setStoreResults([]);
  }, []);

  const {
    imageSearchSession,
    imageSearchError,
    imageInputRef,
    pasteTargetRef,
    isImageSearchMode,
    isImageSearchLoading,
    isAwaitingImageSearch,
    hasMissingImageSearchFile,
    clearImageSearchState,
    triggerImagePicker,
    focusPasteTarget,
    handleImageInputChange,
    handlePasteTargetPaste,
  } = useSearchImageFlow({
    imageSearchToken,
    imageCategory,
    imageStore,
    setIsSearching,
    setProductResults,
    setStoreResults,
    clearSearchResults,
  });

  const refreshHistory = useCallback(() => {
    setHistory(searchService.getRecentSearches());
  }, []);

  const updateSearchParams = useCallback((nextQuery: string, nextScope: SearchScope) => {
    clearImageSearchState(true);
    const normalizedQuery = nextQuery.trim();
    const params = new URLSearchParams();
    if (normalizedQuery) {
      params.set('q', normalizedQuery);
    }
    params.set('scope', nextScope);
    setSearchParams(params);
  }, [clearImageSearchState, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    const fetchResults = async () => {
      if (isImageSearchMode || hasMissingImageSearchFile) {
        return;
      }

      if (isFlashSaleMode) {
        setIsSearching(true);
        try {
          const flashSale = await marketplaceService.getActiveFlashSale();
          if (!cancelled) {
            setProductResults(mapFlashSaleItemsToProducts(flashSale.items));
            setStoreResults([]);
          }
        } catch {
          if (!cancelled) {
            clearSearchResults();
          }
        } finally {
          if (!cancelled) {
            setIsSearching(false);
          }
        }
        return;
      }

      if (!query.trim()) {
        clearSearchResults();
        return;
      }

      setIsSearching(true);
      try {
        if (scope === 'stores') {
          const response = await marketplaceService.searchStores(query, 0, 60);
          if (!cancelled) {
            setStoreResults(response.items);
            setProductResults([]);
          }
        } else {
          const response = await marketplaceService.searchProducts(query, 0, 120);
          if (!cancelled) {
            setProductResults(response.items);
            setStoreResults([]);
          }
        }
      } catch {
        if (!cancelled) {
          clearSearchResults();
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    };

    void fetchResults();
    return () => {
      cancelled = true;
    };
  }, [clearSearchResults, hasMissingImageSearchFile, isFlashSaleMode, isImageSearchMode, query, scope]);

  const filteredResults = useMemo(() => {
    const source = (isFlashSaleMode || isImageSearchMode || (query && scope === 'products'))
      ? productResults
      : [];

    if (!isFlashSaleMode && !isImageSearchMode && !query) {
      return [];
    }
    if (!isFlashSaleMode && !isImageSearchMode && scope !== 'products') {
      return [];
    }

    const filterState: ProductFilterState = {
      priceRanges: view.priceRanges,
      sizes: view.sizes,
      colors: view.colors,
      genders: view.genders,
      fits: view.fits,
      materials: view.materials,
    };
    return filterProducts(source, filterState);
  }, [
    isFlashSaleMode,
    isImageSearchMode,
    query,
    scope,
    productResults,
    view.priceRanges,
    view.sizes,
    view.colors,
    view.genders,
    view.fits,
    view.materials,
  ]);

  const facets = useMemo(() => collectFilterFacets(productResults), [productResults]);
  const activeFilterCount = (
    view.priceRanges.length
    + view.sizes.length
    + view.colors.length
    + view.genders.length
    + view.fits.length
    + view.materials.length
  );

  const clearHistory = () => {
    searchService.clearHistory();
    refreshHistory();
  };

  const removeHistoryItem = (keyword: string) => {
    searchService.removeFromHistory(keyword);
    refreshHistory();
  };

  const handleKeywordClick = (keyword: string) => {
    searchService.addToHistory(keyword);
    refreshHistory();
    updateSearchParams(keyword, scope);
  };

  const handleScopeChange = (nextScope: SearchScope) => {
    updateSearchParams(query, nextScope);
  };

  const isImageSearchPage = isImageSearchMode || isAwaitingImageSearch || hasMissingImageSearchFile;
  const effectiveSortKey = isImageSearchPage && !searchParams.get('sort') ? 'relevance' : view.sortKey;
  const showLanding = !query && !isFlashSaleMode && !isImageSearchPage;
  const hasNoResults = hasMissingImageSearchFile
    ? true
    : isAwaitingImageSearch
      ? false
      : isImageSearchMode
        ? !isImageSearchLoading && filteredResults.length === 0
        : isFlashSaleMode
          ? filteredResults.length === 0
          : scope === 'stores'
            ? storeResults.length === 0
            : false; // Let ProductGrid handle the empty state for standard products search
  const isLoadingResults = isSearching || isAwaitingImageSearch || isImageSearchLoading;

  const headerTitle = isImageSearchPage
    ? 'Kết quả tìm kiếm bằng ảnh'
    : isFlashSaleMode
      ? 'Flash Sale'
      : t.page.resultsFor(query);
  const headerCount = isImageSearchPage
    ? imageSearchSession
      ? isImageSearchLoading
        ? '(Đang xử lý ảnh...)'
        : `(${imageSearchSession.totalCandidates || filteredResults.length} sản phẩm)`
      : ''
    : isFlashSaleMode
      ? `(${t.page.productCount(filteredResults.length)})`
      : scope === 'stores'
        ? `(${storeResults.length} cửa hàng)`
        : `(${t.page.productCount(filteredResults.length)})`;

  return (
    <div className="search-page">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="search-image-input"
        onChange={(event) => void handleImageInputChange(event)}
      />

      <div className="breadcrumb-wrapper">
        <div className="container">
          <nav className="breadcrumbs">
            <Link to="/" className="breadcrumb-link">{CLIENT_TEXT.common.breadcrumb.home}</Link>
            <ChevronRight size={14} className="breadcrumb-separator" />
            <span className="breadcrumb-current">
              {isImageSearchPage ? 'Tìm kiếm bằng ảnh' : isFlashSaleMode ? 'Flash Sale' : CLIENT_TEXT.common.actions.search}
            </span>
          </nav>
        </div>
      </div>

      <div className="search-page-container container">
        {imageSearchError && !hasMissingImageSearchFile && (
          <div className="search-image-error" role="alert">
            {imageSearchError}
          </div>
        )}

        <AnimatePresence mode="wait">
          {showLanding ? (
            <motion.div
              key="landing"
              className="search-landing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <SearchImageLandingHero
                pasteTargetRef={pasteTargetRef}
                onPickImage={triggerImagePicker}
                onFocusPasteTarget={focusPasteTarget}
                onPaste={(event) => void handlePasteTargetPaste(event)}
              />

              {history.length > 0 && (
                <div className="search-history-section">
                  <div className="search-section-header">
                    <h3 className="search-section-title">
                      <Clock size={16} aria-hidden="true" /> {t.dropdown.recentSearches}
                    </h3>
                    <button className="search-clear-btn" onClick={clearHistory} aria-label={t.dropdown.clearAll}>
                      {t.dropdown.clearAll}
                    </button>
                  </div>
                  <div className="search-history-list">
                    {history.slice(0, 5).map((item) => (
                      <motion.div
                        key={item}
                        className="search-history-item"
                        onClick={() => handleKeywordClick(item)}
                        whileHover={{ x: 4 }}
                        transition={{ duration: 0.15 }}
                      >
                        <span className="search-history-text">{item}</span>
                        <button
                          className="search-history-del"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeHistoryItem(item);
                          }}
                          aria-label={`Xóa "${item}" khỏi lịch sử`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              <div className="search-popular">
                <h3 className="search-section-title">
                  <SearchIcon size={16} aria-hidden="true" /> {t.dropdown.popularKeywords}
                </h3>
                <div className="search-keywords">
                  {searchService.getPopularKeywords().map((keyword, index) => (
                    <motion.button
                      key={keyword}
                      className="search-keyword-chip"
                      onClick={() => handleKeywordClick(keyword)}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05, duration: 0.2 }}
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {keyword}
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              className="search-results-section"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="plp-header">
                <h1 className="plp-title">{headerTitle}</h1>
                <span className="plp-count">{headerCount}</span>
              </div>

              {imageSearchSession && isImageSearchPage && (
                <SearchImageQueryPanel
                  fileName={imageSearchSession.fileName}
                  previewUrl={imageSearchSession.previewUrl}
                  totalCandidates={imageSearchSession.totalCandidates}
                  isLoading={isImageSearchLoading || isAwaitingImageSearch}
                  onPickImage={triggerImagePicker}
                  onClear={() => clearImageSearchState(true)}
                />
              )}

              {!isFlashSaleMode && !isImageSearchPage && (
                <div className="search-scope-switch">
                  <button
                    className={scope === 'products' ? 'active' : ''}
                    onClick={() => handleScopeChange('products')}
                  >
                    Sản phẩm
                  </button>
                  <button
                    className={scope === 'stores' ? 'active' : ''}
                    onClick={() => handleScopeChange('stores')}
                  >
                    Cửa hàng
                  </button>
                </div>
              )}

              {isLoadingResults ? (
                <div className={`search-loading-state ${isImageSearchPage ? 'search-loading-state--image' : ''}`}>
                  <LoadingSpinner
                    size={isImageSearchPage ? 'lg' : 'md'}
                    text={isImageSearchPage
                      ? 'Đang phân tích ảnh và tìm sản phẩm phù hợp...'
                      : isFlashSaleMode
                        ? 'Đang tải sản phẩm Flash Sale...'
                        : 'Đang tìm kiếm...'}
                  />
                  {isImageSearchPage && (
                    <p className="search-loading-state__hint">
                      Kết quả sẽ xuất hiện ngay sau khi hệ thống nhận diện xong ảnh của bạn.
                    </p>
                  )}
                </div>
              ) : hasNoResults ? (
                (scope === 'products' || isFlashSaleMode || isImageSearchPage)
                  ? (isFlashSaleMode
                    ? <div className="store-empty-state"><p>Hiện chưa có sản phẩm Flash Sale đang hoạt động.</p></div>
                    : isImageSearchPage
                      ? (
                        <div className="store-empty-state">
                          <p>
                            {hasMissingImageSearchFile
                              ? imageSearchError || 'Ảnh tìm kiếm không còn sau khi tải lại. Vui lòng chọn ảnh lại.'
                              : 'Không tìm thấy sản phẩm phù hợp với ảnh bạn đã tải lên.'}
                          </p>
                          {hasMissingImageSearchFile && (
                            <button
                              type="button"
                              className="search-visual-query__button store-empty-state__action"
                              onClick={triggerImagePicker}
                            >
                              Chọn ảnh lại
                            </button>
                          )}
                        </div>
                      )
                      : null)
                  : <div className="store-empty-state"><p>Không tìm thấy cửa hàng phù hợp cho "{query}".</p></div>
              ) : scope === 'stores' ? (
                <div className="store-results-grid">
                  {storeResults.map((store) => (
                    <Link key={store.id} to={`/store/${store.slug}`} className="store-result-card">
                      <img src={store.logo} alt={store.name} className="store-result-logo" />
                      <div className="store-result-meta">
                        <div className="store-result-code">{store.storeCode}</div>
                        <div className="store-result-name">{store.name}</div>
                        <div className="store-result-sub">
                          <span>★ {store.rating.toFixed(1)}</span>
                          <span>{store.totalOrders} đơn</span>
                          <span>{store.liveProductCount} sản phẩm</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="plp-layout">
                  <motion.button
                    className="mobile-filter-btn"
                    onClick={() => setIsMobileFilterOpen(true)}
                    whileTap={{ scale: 0.98 }}
                  >
                    <SlidersHorizontal size={18} aria-hidden="true" />
                    {CLIENT_TEXT.filter.title}
                    {activeFilterCount > 0 && (
                      <span className="mobile-filter-badge">{activeFilterCount}</span>
                    )}
                  </motion.button>

                  <aside className={`plp-sidebar ${isMobileFilterOpen ? 'is-open' : ''}`}>
                    <div className="mobile-filter-header">
                      <h3>{CLIENT_TEXT.filter.title}</h3>
                      <button
                        className="close-filter-btn"
                        onClick={() => setIsMobileFilterOpen(false)}
                        aria-label="Đóng bộ lọc"
                      >
                        <X size={24} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="sidebar-content">
                      <FilterSidebar
                        selectedPriceRanges={view.priceRanges}
                        selectedSizes={view.sizes}
                        selectedColors={view.colors}
                        selectedGenders={view.genders}
                        selectedFits={view.fits}
                        selectedMaterials={view.materials}
                        sizeOptions={facets.sizes}
                        colorOptions={facets.colors}
                        genderOptions={facets.genders}
                        fitOptions={facets.fits}
                        materialOptions={facets.materials}
                        onTogglePrice={(range) => view.togglePrice(range)}
                        onToggleSize={(size) => view.toggleSize(size)}
                        onToggleColor={(color) => view.toggleColor(color)}
                        onToggleGender={(gender) => view.toggleGender(gender)}
                        onToggleFit={(fit) => view.toggleFit(fit)}
                        onToggleMaterial={(material) => view.toggleMaterial(material)}
                      />
                    </div>
                  </aside>

                  {isMobileFilterOpen && (
                    <motion.div
                      className="filter-overlay"
                      onClick={() => setIsMobileFilterOpen(false)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    />
                  )}

                  <main className="plp-main">
                    <ProductGrid
                      customResults={productResults}
                      itemsPerPage={12}
                      scrollToTopOnPageChange
                      viewState={{
                        priceRanges: view.priceRanges,
                        sizes: view.sizes,
                        colors: view.colors,
                        genders: view.genders,
                        fits: view.fits,
                        materials: view.materials,
                        sortKey: effectiveSortKey,
                        page: view.page,
                        setSort: (value) => view.setSort(value),
                        setPage: (value) => view.setPage(value),
                        availableSortKeys: isImageSearchPage
                          ? ['relevance', 'newest', 'bestseller', 'price-asc', 'price-desc', 'discount']
                          : ['newest', 'bestseller', 'price-asc', 'price-desc', 'discount'],
                      }}
                    />
                  </main>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Search;


