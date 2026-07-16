import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertCircle, ChevronRight, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import FilterSidebar from '../../components/FilterSidebar/FilterSidebar';
import ProductGrid from '../../components/ProductGrid/ProductGrid';
import { useFilter } from '../../contexts/FilterContext';
import { marketplaceService } from '../../services/marketplaceService';
import type { Product } from '../../types';
import './ProductListing.css';
import { useClientViewState } from '../../hooks/useClientViewState';
import { usePageTitle } from '../../hooks/usePageTitle';
import { CLIENT_TEXT } from '../../utils/texts';
import { CLIENT_DICTIONARY } from '../../utils/clientDictionary';
import {
  collectFilterFacets,
  formatGenderLabel,
  getPriceRangeLabel,
} from '../../utils/productFilters';

const CATEGORY_PAGE_TITLES: Record<string, string> = {
  accessories: 'Phụ kiện',
  men: 'Thời trang nam',
  nam: 'Thời trang nam',
  new: 'Sản phẩm mới',
  nu: 'Thời trang nữ',
  'phu-kien': 'Phụ kiện',
  sale: 'Flash Sale',
  women: 'Thời trang nữ',
};

type CategoryLoadState = 'loading' | 'success' | 'error';

const formatCategorySlug = (value: string) => {
  try {
    return decodeURIComponent(value)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((word) => (word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word))
      .join(' ');
  } catch {
    return value;
  }
};

const ProductListing = () => {
  const { id } = useParams<{ id: string }>();
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [categoryLoadState, setCategoryLoadState] = useState<CategoryLoadState>('loading');
  const [categoryRequestKey, setCategoryRequestKey] = useState(0);
  const [loadedCategoryKey, setLoadedCategoryKey] = useState<string | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState(-1);
  const { setFiltersState } = useFilter();
  const view = useClientViewState({
    validSortKeys: ['newest', 'bestseller', 'price-asc', 'price-desc', 'discount'],
    defaultCategory: id || 'all',
  });

  const categoryNames: Record<string, string> = {
    sale: CLIENT_TEXT.productListing.title,
    new: CLIENT_TEXT.productListing.title,
    men: 'Thời Trang Nam',
    women: 'Thời Trang Nữ',
    accessories: 'Phụ Kiện',
  };

  const dictionary = CLIENT_DICTIONARY.listing;
  const currentCategoryName = id && categoryNames[id] ? categoryNames[id] : dictionary.header.title;
  const pageCategoryTitle = id ? CATEGORY_PAGE_TITLES[id] || formatCategorySlug(id) : currentCategoryName;
  usePageTitle(pageCategoryTitle || 'Danh mục');

  useEffect(() => {
    let cancelled = false;
    const resolvedCategory = (id || '').trim();

    const loadCategoryProducts = async () => {
      setCategoryProducts([]);
      setCategoryLoadState('loading');
      try {
        const response = await marketplaceService.searchProducts(
          '',
          0,
          160,
          resolvedCategory && resolvedCategory !== 'all' && resolvedCategory !== 'sale' && resolvedCategory !== 'new'
            ? resolvedCategory
            : undefined,
        );

        const items = (response.items || []).filter((item) => {
          if (resolvedCategory === 'sale') {
            return typeof item.originalPrice === 'number' && item.originalPrice > item.price;
          }
          return true;
        });

        if (!cancelled) {
          setCategoryProducts(items);
          setLoadedCategoryKey(resolvedCategory);
          setLoadedRequestKey(categoryRequestKey);
          setCategoryLoadState('success');
        }
      } catch {
        if (!cancelled) {
          setCategoryProducts([]);
          setLoadedCategoryKey(resolvedCategory);
          setLoadedRequestKey(categoryRequestKey);
          setCategoryLoadState('error');
        }
      }
    };

    void loadCategoryProducts();
    return () => {
      cancelled = true;
    };
  }, [id, categoryRequestKey]);

  useEffect(() => {
    setFiltersState({
      priceRanges: view.priceRanges,
      sizes: view.sizes,
      colors: view.colors,
      genders: view.genders,
      fits: view.fits,
      materials: view.materials,
      sortBy: view.sortKey,
    });
  }, [
    view.priceRanges,
    view.sizes,
    view.colors,
    view.genders,
    view.fits,
    view.materials,
    view.sortKey,
    setFiltersState,
  ]);

  const currentCategoryKey = (id || '').trim();
  const hasCurrentRequest = loadedCategoryKey === currentCategoryKey && loadedRequestKey === categoryRequestKey;
  const isCategoryLoading = !hasCurrentRequest || categoryLoadState === 'loading';
  const isCategoryError = hasCurrentRequest && categoryLoadState === 'error';
  const productsForGrid = useMemo(
    () => (hasCurrentRequest && categoryLoadState === 'success' ? categoryProducts : []),
    [categoryLoadState, categoryProducts, hasCurrentRequest],
  );

  const facets = useMemo(() => collectFilterFacets(productsForGrid), [productsForGrid]);
  const colorLabelByValue = useMemo(
    () => new Map(facets.colors.map((color) => [color.value, color.label])),
    [facets.colors],
  );

  const activeChips = [
    ...view.priceRanges.map((range) => ({
      key: `price-${range}`,
      label: getPriceRangeLabel(range),
      onRemove: () => view.togglePrice(range),
    })),
    ...view.sizes.map((size) => ({
      key: `size-${size}`,
      label: dictionary.chips.size.replace('{value}', size),
      onRemove: () => view.toggleSize(size),
    })),
    ...view.colors.map((color) => ({
      key: `color-${color}`,
      label: colorLabelByValue.get(color) || color,
      onRemove: () => view.toggleColor(color),
    })),
    ...view.genders.map((gender) => ({
      key: `gender-${gender}`,
      label: `Giới tính: ${formatGenderLabel(gender)}`,
      onRemove: () => view.toggleGender(gender),
    })),
    ...view.fits.map((fit) => ({
      key: `fit-${fit}`,
      label: `Dáng: ${fit}`,
      onRemove: () => view.toggleFit(fit),
    })),
    ...view.materials.map((material) => ({
      key: `material-${material}`,
      label: `Chất liệu: ${material}`,
      onRemove: () => view.toggleMaterial(material),
    })),
  ];

  return (
    <div className="plp-page">
      <div className="breadcrumb-wrapper">
        <div className="container">
          <nav className="breadcrumbs">
            <Link to="/" className="breadcrumb-link">{dictionary.breadcrumbs.home}</Link>
            <ChevronRight size={14} className="breadcrumb-separator" />
            <span className="breadcrumb-current">{currentCategoryName || dictionary.breadcrumbs.all}</span>
          </nav>
        </div>
      </div>

      <div className="container plp-container">
        <div className="plp-header">
          <h1 className="plp-title">{currentCategoryName || dictionary.header.title}</h1>
          <span className="plp-count">{dictionary.header.countSuffix}</span>
        </div>

        {activeChips.length > 0 && (
          <div className="active-filters-bar">
            <span className="active-filters-label">{dictionary.activeFilters}</span>
            <div className="active-chips">
              {activeChips.map((chip) => (
                <button key={chip.key} className="filter-chip" onClick={chip.onRemove}>
                  {chip.label}
                  <X size={13} />
                </button>
              ))}
            </div>
            <button className="clear-all-filters" onClick={() => view.reset()}>
              {dictionary.filters.clearAll}
            </button>
          </div>
        )}

        <div className="plp-layout">
          <button
            className="mobile-filter-btn"
            onClick={() => setIsMobileFilterOpen(true)}
          >
            <SlidersHorizontal size={18} />
            {dictionary.filters.label}
            {activeChips.length > 0 && (
              <span className="mobile-filter-badge">{activeChips.length}</span>
            )}
          </button>

          <aside className={`plp-sidebar ${isMobileFilterOpen ? 'is-open' : ''}`}>
            <div className="mobile-filter-header">
              <h3>{dictionary.filters.label}</h3>
              <button
                className="close-filter-btn"
                onClick={() => setIsMobileFilterOpen(false)}
              >
                <X size={24} />
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
            <div
              className="filter-overlay"
              onClick={() => setIsMobileFilterOpen(false)}
            />
          )}

          <main className="plp-main" aria-busy={isCategoryLoading}>
            {isCategoryError ? (
              <div className="category-load-error" role="alert">
                <AlertCircle size={44} aria-hidden="true" />
                <p>{dictionary.error}</p>
                <button
                  type="button"
                  onClick={() => setCategoryRequestKey((requestKey) => requestKey + 1)}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  {dictionary.retry}
                </button>
              </div>
            ) : (
              <ProductGrid
                customResults={productsForGrid}
                isLoading={isCategoryLoading}
                itemsPerPage={12}
                scrollToTopOnPageChange
                viewState={{
                  priceRanges: view.priceRanges,
                  sizes: view.sizes,
                  colors: view.colors,
                  genders: view.genders,
                  fits: view.fits,
                  materials: view.materials,
                  sortKey: view.sortKey,
                  page: view.page,
                  setSort: (value) => view.setSort(value),
                  setPage: (value) => view.setPage(value),
                }}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default ProductListing;
