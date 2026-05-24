import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Clock, X, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchService } from '../../services/searchService';
import { formatPrice } from '../../utils/formatters';
import { CLIENT_TEXT } from '../../utils/texts';
import type { Product } from '../../types';
import './SearchDropdown.css';

const t = CLIENT_TEXT.search.dropdown;
const DEBOUNCE_MS = 300;

interface SearchDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  inputValue: string;
  onSearch: (query: string) => void;
}

const SearchDropdown = ({ isOpen, onClose, inputValue, onSearch }: SearchDropdownProps) => {
  const [debouncedQuery, setDebouncedQuery] = useState(inputValue);
  const [, setHistoryVersion] = useState(0);
  const dropRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(inputValue);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [inputValue]);

  const normalizedInput = inputValue.trim();
  const normalizedDebouncedQuery = debouncedQuery.trim();
  const isSearching = normalizedInput.length >= 2 && debouncedQuery !== inputValue;
  const suggestions = useMemo<Product[]>(
    () => (normalizedDebouncedQuery.length >= 2 ? searchService.search(debouncedQuery, 5) : []),
    [debouncedQuery, normalizedDebouncedQuery],
  );
  const history = searchService.getRecentSearches();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  const clearHistory = useCallback(() => {
    searchService.clearHistory();
    setHistoryVersion((version) => version + 1);
  }, []);

  const removeHistoryItem = useCallback((keyword: string) => {
    searchService.removeFromHistory(keyword);
    setHistoryVersion((version) => version + 1);
  }, []);

  const handleProductClick = useCallback(() => {
    searchService.addToHistory(inputValue);
    setHistoryVersion((version) => version + 1);
    onClose();
  }, [inputValue, onClose]);

  const handleSearchClick = useCallback((query: string) => {
    searchService.addToHistory(query);
    setHistoryVersion((version) => version + 1);
    onSearch(query);
    onClose();
  }, [onSearch, onClose]);

  const totalResults = inputValue.trim() ? searchService.search(inputValue, 100).length : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="search-dropdown"
          ref={dropRef}
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          role="listbox"
          aria-label={t.placeholder}
        >
          {inputValue.trim() && inputValue.length >= 2 ? (
            <div className="sd-suggestions">
              {isSearching ? (
                <div className="sd-loading">
                  <div className="sd-loading-spinner" />
                  <span>{CLIENT_TEXT.common.messages.loading}</span>
                </div>
              ) : suggestions.length > 0 ? (
                <>
                  <p className="sd-section-title">{CLIENT_TEXT.search.suggestions.title}</p>
                  <AnimatePresence>
                    <div className="sd-suggestion-list">
                      {suggestions.map((product, i) => (
                        <motion.div
                          key={product.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -4 }}
                          transition={{ delay: i * 0.04, duration: 0.2, ease: 'easeOut' }}
                        >
                          <Link
                            to={`/product/${product.id}`}
                            className="sd-suggestion-item"
                            onClick={handleProductClick}
                            role="option"
                          >
                            <img
                              src={product.image}
                              alt={product.name}
                              className="sd-suggestion-img"
                              loading="lazy"
                            />
                            <div className="sd-suggestion-info">
                              <span className="sd-suggestion-name">{product.name}</span>
                              <span className="sd-suggestion-price">
                                {formatPrice(product.price)}
                              </span>
                            </div>
                            {product.badge && (
                              <span className="sd-suggestion-badge">{product.badge}</span>
                            )}
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  </AnimatePresence>
                  <motion.button
                    type="button"
                    className="sd-view-all"
                    onClick={() => handleSearchClick(inputValue)}
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Search size={14} />
                    {t.viewAllFor(totalResults)} cho "{inputValue}"
                  </motion.button>
                </>
              ) : (
                <div className="sd-no-results">
                  <p>{t.noResults}</p>
                  <p className="sd-no-results-hint">
                    Thử tìm với từ khóa khác
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="sd-default">
              {history.length > 0 && (
                <div className="sd-history-section">
                  <div className="sd-section-header">
                    <p className="sd-section-title">
                      <Clock size={14} /> {t.recentSearches}
                    </p>
                    <button
                      type="button"
                      className="sd-clear-all"
                      onClick={clearHistory}
                      aria-label={t.clearAll}
                    >
                      {t.clearHistory}
                    </button>
                  </div>
                  <div className="sd-history-list">
                    {history.slice(0, 5).map((item, i) => (
                      <motion.div
                        key={item}
                        className="sd-history-item"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -4 }}
                        transition={{ delay: i * 0.04, duration: 0.2, ease: 'easeOut' }}
                      >
                        <button
                          type="button"
                          className="sd-history-text"
                          onClick={() => handleSearchClick(item)}
                        >
                          <Clock size={14} /> {item}
                        </button>
                        <button
                          type="button"
                          className="sd-history-remove"
                          onClick={() => removeHistoryItem(item)}
                          aria-label={`${t.clearAll} "${item}"`}
                        >
                          <X size={14} />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              <div className="sd-popular-section">
                <p className="sd-section-title">
                  <TrendingUp size={14} /> {t.popularKeywords}
                </p>
                <div className="sd-popular-chips">
                  {searchService.getPopularKeywords().map((kw, i) => (
                    <motion.button
                      type="button"
                      key={kw}
                      className="sd-popular-chip"
                      onClick={() => handleSearchClick(kw)}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -4 }}
                      transition={{ delay: i * 0.04, duration: 0.2, ease: 'easeOut' }}
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {kw}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SearchDropdown;
