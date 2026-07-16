import { useState, useEffect, useMemo } from 'react';
import { ShoppingBag } from 'lucide-react';
import './ProductGrid.css';
import ProductCardSkeleton from '../ProductCardSkeleton/ProductCardSkeleton';
import ProductCardGrid from '../ProductCardGrid/ProductCardGrid';
import { productService } from '../../services/productService';
import { CLIENT_TEXT } from '../../utils/texts';
import { CLIENT_DICTIONARY } from '../../utils/clientDictionary';
import type { Product } from '../../types';
import { useClientViewState } from '../../hooks/useClientViewState';
import {
  filterProducts,
  sortProducts,
  type ProductFilterState,
  type ProductSortKey,
} from '../../utils/productFilters';

const t = CLIENT_TEXT.filter;
const tListing = CLIENT_TEXT.productListing;

interface ProductGridViewState {
  priceRanges: string[];
  sizes: string[];
  colors: string[];
  genders: string[];
  fits: string[];
  materials: string[];
  sortKey: ProductSortKey;
  page?: number;
  setSort: (value: ProductSortKey) => void;
  setPage?: (value: number) => void;
  availableSortKeys?: readonly ProductSortKey[];
}

interface ProductGridProps {
  customResults?: Product[];
  isLoading?: boolean;
  viewState?: ProductGridViewState;
  itemsPerPage?: number;
  scrollToTopOnPageChange?: boolean;
}

type PaginationToken = number | 'dots';

const buildPaginationTokens = (currentPage: number, totalPages: number): PaginationToken[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const tokens: PaginationToken[] = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) {
    tokens.push('dots');
  }

  for (let page = left; page <= right; page += 1) {
    tokens.push(page);
  }

  if (right < totalPages - 1) {
    tokens.push('dots');
  }

  tokens.push(totalPages);
  return tokens;
};

const ProductGrid = ({
  customResults,
  isLoading: isLoadingOverride,
  viewState,
  itemsPerPage,
  scrollToTopOnPageChange = false,
}: ProductGridProps) => {
  const hasCustomResults = customResults !== undefined;
  const [isLoading, setIsLoading] = useState(!hasCustomResults);
  const [catalog, setCatalog] = useState<Product[]>(() => customResults || productService.list());
  const internalView = useClientViewState({ validSortKeys: ['newest', 'bestseller', 'price-asc', 'price-desc', 'discount'] });
  const view = viewState ?? internalView;
  const sortOptions: Array<{ key: ProductSortKey; label: string }> = [
    { key: 'relevance', label: 'Liên quan nhất' },
    { key: 'newest', label: t.sort.newest },
    { key: 'bestseller', label: t.sort.bestseller },
    { key: 'price-asc', label: t.sort.priceAsc },
    { key: 'price-desc', label: t.sort.priceDesc },
    { key: 'discount', label: t.sort.discount },
  ];
  const availableSortKeys = ('availableSortKeys' in view && view.availableSortKeys)
    ? view.availableSortKeys
    : ['newest', 'bestseller', 'price-asc', 'price-desc', 'discount'];
  const visibleSortOptions = sortOptions.filter((option) => availableSortKeys.includes(option.key));

  useEffect(() => {
    let isMounted = true;

    if (hasCustomResults) {
      return () => {
        isMounted = false;
      };
    }

    const timer = setTimeout(() => {
      void (async () => {
        const nextCatalog = await productService.listPublic();
        if (!isMounted) {
          return;
        }
        setCatalog(nextCatalog);
        setIsLoading(false);
      })();
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [hasCustomResults]);

  const filteredProducts = useMemo(() => {
    const source = customResults || catalog;
    const filterState: ProductFilterState = {
      priceRanges: view.priceRanges,
      sizes: view.sizes,
      colors: view.colors,
      genders: view.genders,
      fits: view.fits,
      materials: view.materials,
    };
    return sortProducts(filterProducts(source, filterState), view.sortKey);
  }, [view.priceRanges, view.sizes, view.colors, view.genders, view.fits, view.materials, view.sortKey, customResults, catalog]);

  const totalProducts = filteredProducts.length;
  const hasPagination = typeof itemsPerPage === 'number' && itemsPerPage > 0;
  const pageSize = hasPagination ? Math.max(1, Math.floor(itemsPerPage)) : totalProducts || 1;
  const totalPages = hasPagination ? Math.max(1, Math.ceil(totalProducts / pageSize)) : 1;
  const rawCurrentPage = typeof view.page === 'number' ? view.page : internalView.page;
  const currentPage = hasPagination ? Math.min(Math.max(rawCurrentPage, 1), totalPages) : 1;

  const scrollViewportToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.body.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const scrollingElement = document.scrollingElement as HTMLElement | null;
    scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const appContainer = document.querySelector<HTMLElement>('.app-container');
    appContainer?.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      appContainer?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  };

  const changePage = (nextPage: number) => {
    const normalized = Math.min(Math.max(nextPage, 1), totalPages);
    if (normalized === currentPage) {
      return;
    }

    if (hasPagination && scrollToTopOnPageChange) {
      scrollViewportToTop();
    }
    if (typeof view.setPage === 'function') {
      view.setPage(normalized);
      return;
    }
    internalView.setPage(normalized);
  };

  const pagedProducts = useMemo(() => {
    if (!hasPagination) {
      return filteredProducts;
    }
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [hasPagination, filteredProducts, currentPage, pageSize]);

  const rangeStart = totalProducts === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = totalProducts === 0 ? 0 : Math.min(currentPage * pageSize, totalProducts);
  const paginationTokens = useMemo(
    () => (hasPagination ? buildPaginationTokens(currentPage, totalPages) : []),
    [hasPagination, currentPage, totalPages],
  );
  const dictionary = CLIENT_DICTIONARY.listing;
  const showLoading = isLoadingOverride ?? (!hasCustomResults && isLoading);

  return (
    <div className="product-grid-container" aria-busy={showLoading}>
      <div className="plp-toolbar">
        <div className="toolbar-left">
          <span className="results-count">
            {dictionary.resultsLabel
              .replace('{start}', String(rangeStart))
              .replace('{end}', String(rangeEnd))
              .replace('{total}', String(totalProducts))}
          </span>
        </div>
        <div className="toolbar-right">
          <label htmlFor="sort-select" className="sort-label">{t.sort.label}:</label>
          <select
            id="sort-select"
            className="sort-select"
            value={view.sortKey}
            onChange={(e) => view.setSort(e.target.value as ProductSortKey)}
          >
            {visibleSortOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="plp-grid">
        {showLoading
          ? Array.from({ length: 8 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))
          : pagedProducts.length > 0
            ? (
              <div className="plp-grid__content">
                <ProductCardGrid
                  items={pagedProducts}
                  getItemKey={(product) => product.id}
                  mapItemToCardProps={(product) => product}
                />
              </div>
            )
            : (
              <div className="no-products">
                <ShoppingBag size={48} className="no-products-icon" strokeWidth={1.5} />
                <p>{dictionary.empty}</p>
              </div>
            )}
      </div>

      {hasPagination && totalPages > 1 && (
        <div className="plp-pagination">
          <button
            type="button"
            className={`pagination-btn ${currentPage === 1 ? 'disabled' : ''}`}
            disabled={currentPage === 1}
            onClick={() => changePage(currentPage - 1)}
          >
            {tListing.prevPage}
          </button>

          <div className="pagination-numbers">
            {paginationTokens.map((token, index) => (
              token === 'dots' ? (
                <span key={`dots-${index}`} className="page-dots">...</span>
              ) : (
                <button
                  type="button"
                  key={token}
                  className={`page-number ${token === currentPage ? 'active' : ''}`}
                  onClick={() => changePage(token)}
                >
                  {token}
                </button>
              )
            ))}
          </div>

          <button
            type="button"
            className={`pagination-btn ${currentPage === totalPages ? 'disabled' : ''}`}
            disabled={currentPage === totalPages}
            onClick={() => changePage(currentPage + 1)}
          >
            {tListing.nextPage}
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductGrid;
