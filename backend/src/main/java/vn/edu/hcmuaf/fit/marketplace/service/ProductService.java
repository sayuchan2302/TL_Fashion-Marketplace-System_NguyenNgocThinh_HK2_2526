package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import vn.edu.hcmuaf.fit.marketplace.dto.request.ProductRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorProductPageResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorProductSummaryResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Category;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductAuditLog;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductImage;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductVariant;
import vn.edu.hcmuaf.fit.marketplace.entity.Product.Gender;
import vn.edu.hcmuaf.fit.marketplace.entity.Product.ProductStatus;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.exception.ForbiddenException;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;
import vn.edu.hcmuaf.fit.marketplace.repository.CategoryRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductAuditLogRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductVariantRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.math.BigDecimal;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ProductVariantRepository productVariantRepository;
    private final StoreRepository storeRepository;
    private final OrderRepository orderRepository;
    private final ProductAuditLogRepository productAuditLogRepository;

    private static final int LOW_STOCK_THRESHOLD = 10;
    private static final int MAX_PRODUCT_IMAGES = 4;
    private static final List<ProductAuditLog.Action> VENDOR_BLOCK_REASON_ACTIONS = List.of(
            ProductAuditLog.Action.BANNED,
            ProductAuditLog.Action.REJECTED,
            ProductAuditLog.Action.REPORT_CONFIRMED);

    public enum InventoryState {
        LOW,
        OUT
    }

    public enum StorefrontProductSort {
        NEWEST,
        PRICE_ASC,
        PRICE_DESC;

        public static StorefrontProductSort from(String value) {
            if (value == null || value.isBlank()) {
                return NEWEST;
            }

            try {
                return StorefrontProductSort.valueOf(value.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException ex) {
                return NEWEST;
            }
        }
    }

    public record StorefrontProductFilters(
            String keyword,
            UUID categoryId,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            StorefrontProductSort sort) {

        String normalizedKeyword() {
            return keyword == null ? "" : keyword.trim();
        }

        BigDecimal normalizedMinPrice() {
            return normalizePrice(minPrice);
        }

        BigDecimal normalizedMaxPrice() {
            return normalizePrice(maxPrice);
        }

        StorefrontProductSort normalizedSort() {
            return sort == null ? StorefrontProductSort.NEWEST : sort;
        }
    }

    private record ProductSalesSnapshot(long soldCount, BigDecimal grossRevenue) {
    }

    public ProductService(
            ProductRepository productRepository,
            CategoryRepository categoryRepository,
            ProductVariantRepository productVariantRepository,
            StoreRepository storeRepository,
            OrderRepository orderRepository,
            ProductAuditLogRepository productAuditLogRepository) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.productVariantRepository = productVariantRepository;
        this.storeRepository = storeRepository;
        this.orderRepository = orderRepository;
        this.productAuditLogRepository = productAuditLogRepository;
    }

    // ─── Public Methods (No tenant filtering) ──────────────────────────────────

    @Transactional(readOnly = true)
    public List<Product> findAll() {
        List<Product> products = productRepository.findAllPublicProducts();
        products.forEach(this::initializeForSerialization);
        attachDeliveredSales(products);
        return products;
    }

    @Transactional(readOnly = true)
    public Product findById(UUID id) {
        Product product = productRepository.findPublicById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found"));
        initializeForSerialization(product);
        attachDeliveredSales(product);
        return product;
    }

    @Transactional(readOnly = true)
    public Product findByIdIncludingInactive(UUID id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found"));
        initializeForSerialization(product);
        attachDeliveredSales(product);
        return product;
    }

    @Transactional(readOnly = true)
    public Product findBySlug(String slug) {
        String normalized = slug == null ? "" : slug.trim();
        Product product = productRepository.findPublicBySlug(normalized)
                .or(() -> productRepository.findPublicBySku(normalized))
                .orElseThrow(() -> new ResourceNotFoundException("Product not found"));
        initializeForSerialization(product);
        attachDeliveredSales(product);
        return product;
    }

    @Transactional(readOnly = true)
    public Product findBySku(String sku) {
        String normalizedSku = sku == null ? "" : sku.trim();
        Product product = productRepository.findPublicBySku(normalizedSku)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found"));
        initializeForSerialization(product);
        attachDeliveredSales(product);
        return product;
    }

    // ─── Vendor-scoped Methods (Multi-tenant) ──────────────────────────────────

    /**
     * Find all products for a specific store (vendor's view)
     */
    @Transactional(readOnly = true)
    public Page<Product> findByStoreId(UUID storeId, Pageable pageable) {
        Page<Product> page = productRepository.findByStoreId(storeId, pageable);
        page.getContent().forEach(this::initializeForSerialization);
        attachDeliveredSales(page.getContent());
        return page;
    }

    /**
     * Find active products for a store (public storefront)
     */
    @Transactional(readOnly = true)
    public Page<Product> findActiveByStoreId(UUID storeId, Pageable pageable) {
        Page<Product> page = productRepository.findActiveByStoreId(storeId, pageable);
        page.getContent().forEach(this::initializeForSerialization);
        attachDeliveredSales(page.getContent());
        return page;
    }

    /**
     * Find active products by store identifier (UUID or slug)
     */
    @Transactional(readOnly = true)
    public Page<Product> findActiveByStoreIdentifier(String identifier, Pageable pageable) {
        return findActiveByStoreIdentifier(
                identifier,
                new StorefrontProductFilters(null, null, null, null, StorefrontProductSort.NEWEST),
                pageable);
    }

    /**
     * Find active products by store identifier (UUID or slug) with public
     * storefront filters.
     */
    @Transactional(readOnly = true)
    public Page<Product> findActiveByStoreIdentifier(
            String identifier,
            StorefrontProductFilters filters,
            Pageable pageable) {
        Optional<UUID> storeId = resolvePublicStoreId(identifier);
        if (storeId.isEmpty()) {
            return Page.empty(pageable);
        }

        Page<Product> page = productRepository.findAll(buildPublicStorefrontSpec(storeId.get(), filters), pageable);
        page.getContent().forEach(this::initializeForSerialization);
        attachDeliveredSales(page.getContent());
        return page;
    }

    private Optional<UUID> resolvePublicStoreId(String identifier) {
        try {
            UUID storeId = UUID.fromString(identifier);
            return storeRepository.findById(storeId)
                    .filter(this::isPublicStore)
                    .map(Store::getId);
        } catch (IllegalArgumentException ex) {
            Store store = storeRepository.findBySlug(identifier)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Store not found"));
            return isPublicStore(store) ? Optional.of(store.getId()) : Optional.empty();
        }
    }

    private boolean isPublicStore(Store store) {
        return store.getStatus() == Store.StoreStatus.ACTIVE
                && store.getApprovalStatus() == Store.ApprovalStatus.APPROVED;
    }

    /**
     * Find product by ID with ownership check (for vendor operations)
     */
    public Product findByIdAndStoreId(UUID id, UUID storeId) {
        return productRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found or access denied"));
    }

    /**
     * Search products within a store
     */
    @Transactional(readOnly = true)
    public Page<Product> searchByStoreId(UUID storeId, String keyword, Pageable pageable) {
        Page<Product> page = productRepository.searchProductsByStore(storeId, keyword, pageable);
        page.getContent().forEach(this::initializeForSerialization);
        attachDeliveredSales(page.getContent());
        return page;
    }

    private Specification<Product> buildPublicStorefrontSpec(UUID storeId, StorefrontProductFilters filters) {
        StorefrontProductFilters activeFilters = filters == null
                ? new StorefrontProductFilters(null, null, null, null, StorefrontProductSort.NEWEST)
                : filters;

        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("storeId"), storeId));
            predicates.add(cb.equal(root.get("status"), ProductStatus.ACTIVE));
            predicates.add(cb.or(
                    cb.equal(root.get("approvalStatus"), Product.ApprovalStatus.APPROVED),
                    cb.isNull(root.get("approvalStatus"))));

            String keyword = activeFilters.normalizedKeyword().toLowerCase(Locale.ROOT);
            if (!keyword.isBlank()) {
                String pattern = "%" + keyword + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)));
            }

            if (activeFilters.categoryId() != null) {
                predicates.add(cb.equal(root.get("category").get("id"), activeFilters.categoryId()));
            }

            Expression<BigDecimal> effectivePrice = getEffectivePriceExpression(root, cb);
            BigDecimal minPrice = activeFilters.normalizedMinPrice();
            BigDecimal maxPrice = activeFilters.normalizedMaxPrice();
            if (minPrice != null) {
                predicates.add(cb.greaterThanOrEqualTo(effectivePrice, minPrice));
            }
            if (maxPrice != null) {
                predicates.add(cb.lessThanOrEqualTo(effectivePrice, maxPrice));
            }

            if (query != null && !Long.class.equals(query.getResultType())
                    && !long.class.equals(query.getResultType())) {
                applyStorefrontSort(root, query, cb, activeFilters.normalizedSort(), effectivePrice);
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Expression<BigDecimal> getEffectivePriceExpression(Root<Product> root, CriteriaBuilder cb) {
        Expression<BigDecimal> salePrice = root.get("salePrice");
        Expression<BigDecimal> basePrice = cb.coalesce(root.get("basePrice"), BigDecimal.ZERO);
        return cb.<BigDecimal>selectCase()
                .when(cb.and(cb.isNotNull(salePrice), cb.greaterThan(salePrice, BigDecimal.ZERO)), salePrice)
                .otherwise(basePrice);
    }

    private void applyStorefrontSort(
            Root<Product> root,
            jakarta.persistence.criteria.CriteriaQuery<?> query,
            CriteriaBuilder cb,
            StorefrontProductSort sort,
            Expression<BigDecimal> effectivePrice) {
        if (sort == StorefrontProductSort.PRICE_ASC) {
            query.orderBy(cb.asc(effectivePrice), cb.desc(root.get("createdAt")));
            return;
        }

        if (sort == StorefrontProductSort.PRICE_DESC) {
            query.orderBy(cb.desc(effectivePrice), cb.desc(root.get("createdAt")));
            return;
        }

        query.orderBy(cb.desc(root.get("createdAt")));
    }

    private static BigDecimal normalizePrice(BigDecimal value) {
        if (value == null) {
            return null;
        }
        return value.max(BigDecimal.ZERO);
    }

    private void initializeForSerialization(Product product) {
        if (product == null) {
            return;
        }

        if (product.getCategory() != null) {
            product.getCategory().getName();
        }

        if (product.getImages() != null) {
            product.getImages().size();
        }

        if (product.getVariants() != null) {
            product.getVariants().size();
        }
    }

    @Transactional(readOnly = true)
    public VendorProductPageResponse getVendorProductPage(
            UUID storeId,
            ProductStatus status,
            Product.ApprovalStatus approvalStatus,
            String keyword,
            UUID categoryId,
            InventoryState inventoryState,
            Pageable pageable) {
        org.springframework.data.jpa.domain.Specification<Product> spec = vn.edu.hcmuaf.fit.marketplace.repository.specification.VendorProductSpecification
                .filterBy(
                        storeId,
                        status,
                        approvalStatus,
                        normalizeKeyword(keyword),
                        categoryId,
                        inventoryState == null ? null : inventoryState.name(),
                        LOW_STOCK_THRESHOLD);
        Page<Product> page = productRepository.findAll(spec, pageable);
        Map<UUID, ProductSalesSnapshot> salesByProductId = loadDeliveredSalesByProduct(page.getContent(), storeId);
        Map<UUID, String> blockReasonsByProductId = loadVendorBlockReasons(page.getContent());

        return VendorProductPageResponse.builder()
                .content(page.getContent().stream()
                        .map(product -> toVendorProductSummaryResponse(
                                product,
                                salesByProductId.get(product.getId()),
                                blockReasonsByProductId.get(product.getId())))
                        .toList())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .number(page.getNumber())
                .size(page.getSize())
                .statusCounts(buildVendorStatusCounts(storeId))
                .build();
    }

    /**
     * Get product count for a store (dashboard metric)
     */
    public long countByStoreId(UUID storeId) {
        return productRepository.countByStoreId(storeId);
    }

    private VendorProductPageResponse.StatusCounts buildVendorStatusCounts(UUID storeId) {
        return VendorProductPageResponse.StatusCounts.builder()
                .all(productRepository.countByStoreIdExcludingArchived(storeId))
                .active(productRepository.countVisibleByStoreId(storeId))
                .draft(
                        productRepository.countByStoreIdAndStatus(storeId, ProductStatus.DRAFT)
                                + productRepository.countByStoreIdAndStatus(storeId, ProductStatus.INACTIVE))
                .outOfStock(productRepository.countOutOfStockByStoreId(storeId))
                .lowStock(productRepository.countLowStockByStoreId(storeId, LOW_STOCK_THRESHOLD))
                .banned(productRepository.countBannedByStoreId(storeId))
                .build();
    }

    // ─── Create (Vendor must provide storeId) ──────────────────────────────────

    @Transactional
    public Product create(ProductRequest request) {
        // Legacy: no storeId - platform product
        return createForStore(request, null);
    }

    /**
     * Create product for a specific store (vendor operation)
     */
    @Transactional
    public Product createForStore(ProductRequest request, UUID storeId) {
        ProductStatus status = parseStatus(request.getStatus()).orElse(ProductStatus.DRAFT);
        validateBasicRequest(request);

        if (request.getName() == null || request.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Product name is required");
        }

        if (request.getCategoryId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is required");
        }

        List<String> incomingImageUrls = resolveIncomingImageUrls(request);
        if (incomingImageUrls.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Product image is required");
        }

        BigDecimal effectivePrice = request.getSalePrice() != null
                && request.getSalePrice().compareTo(BigDecimal.ZERO) > 0
                        ? request.getSalePrice()
                        : (request.getBasePrice() == null ? BigDecimal.ZERO : request.getBasePrice());
        if (effectivePrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Price must be greater than 0");
        }

        Product product = Product.builder()
                .name(request.getName())
                .slug(request.getSlug())
                .storeId(storeId) // Set store ownership
                .description(request.getDescription())
                .sizeAndFit(resolveSizeAndFit(request))
                .fabricAndCare(resolveFabricAndCare(request))
                .highlights(resolveSizeAndFit(request))
                .careInstructions(resolveFabricAndCare(request))
                .basePrice(request.getBasePrice())
                .salePrice(request.getSalePrice())
                .material(null)
                .fit(request.getFit())
                .status(status)
                // Business rule: vendor products are published immediately.
                // Admin moderation is handled as post-publication governance.
                .approvalStatus(Product.ApprovalStatus.APPROVED)
                .build();

        if (request.getGender() != null) {
            product.setGender(Gender.valueOf(request.getGender().toUpperCase()));
        }

        Category category = resolveLeafCategoryOrThrow(request.getCategoryId());
        product.setCategory(category);

        syncImages(product, incomingImageUrls);
        syncVariants(product, request);
        validatePublishRules(product, status);
        validateSlugUniquenessForCreate(product.getSlug());
        validateSkuUniqueness(product, null);

        return productRepository.save(product);
    }

    @Transactional
    public VendorProductSummaryResponse createVendorProduct(ProductRequest request, UUID storeId) {
        clearVendorProvidedSku(request);
        Product created = createForStore(request, storeId);
        return toVendorProductSummaryResponse(created);
    }

    // ─── Update (With ownership validation) ────────────────────────────────────

    /**
     * Legacy update - no ownership check (admin only)
     */
    @Transactional
    public Product update(UUID id, ProductRequest request) {
        Product product = findByIdIncludingInactive(id);
        return applyUpdates(product, request);
    }

    /**
     * Update product with ownership validation (vendor operation)
     * 
     * @throws ForbiddenException if vendor doesn't own the product
     */
    @Transactional
    public Product updateForStore(UUID id, UUID storeId, ProductRequest request) {
        Product product = productRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new ForbiddenException("Product not found or you don't have permission to edit it"));
        ensureVendorCanMutate(product, "edited");

        return applyUpdates(product, request);
    }

    @Transactional
    public VendorProductSummaryResponse updateVendorProduct(UUID id, UUID storeId, ProductRequest request) {
        clearVendorProvidedSku(request);
        Product updated = updateForStore(id, storeId, request);
        return toVendorProductSummaryResponse(updated);
    }

    @Transactional
    public VendorProductSummaryResponse updateProductSummary(UUID id, ProductRequest request) {
        Product updated = update(id, request);
        return toVendorProductSummaryResponse(updated);
    }

    private Product applyUpdates(Product product, ProductRequest request) {
        validateBasicRequest(request);
        if (request.getName() != null)
            product.setName(request.getName());
        if (request.getSlug() != null)
            product.setSlug(request.getSlug());
        if (request.getDescription() != null)
            product.setDescription(request.getDescription());
        if (request.getSizeAndFit() != null || request.getHighlights() != null) {
            String sizeAndFit = resolveSizeAndFit(request);
            product.setSizeAndFit(sizeAndFit);
            product.setHighlights(sizeAndFit);
        }
        if (request.getFabricAndCare() != null || request.getMaterial() != null
                || request.getCareInstructions() != null) {
            String fabricAndCare = resolveFabricAndCare(request);
            product.setFabricAndCare(fabricAndCare);
            product.setCareInstructions(fabricAndCare);
            product.setMaterial(null);
        }
        if (request.getBasePrice() != null)
            product.setBasePrice(request.getBasePrice());
        if (request.getSalePrice() != null)
            product.setSalePrice(request.getSalePrice());
        if (request.getFit() != null)
            product.setFit(request.getFit());
        if (request.getGender() != null) {
            product.setGender(Gender.valueOf(request.getGender().toUpperCase()));
        }
        parseStatus(request.getStatus()).ifPresent(product::setStatus);
        if (request.getCategoryId() != null) {
            Category category = resolveLeafCategoryOrThrow(request.getCategoryId());
            product.setCategory(category);
        }
        if (request.getImageUrls() != null || request.getImageUrl() != null) {
            syncImages(product, resolveIncomingImageUrls(request));
        }
        syncVariants(product, request);
        validatePublishRules(product, product.getStatus());
        validateSlugUniquenessForUpdate(product.getSlug(), product.getId());
        validateSkuUniqueness(product, product.getId());

        return productRepository.save(product);
    }

    private Optional<ProductStatus> parseStatus(String rawStatus) {
        if (rawStatus == null || rawStatus.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(ProductStatus.valueOf(rawStatus.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported product status: " + rawStatus);
        }
    }

    private List<String> resolveIncomingImageUrls(ProductRequest request) {
        LinkedHashSet<String> normalized = new LinkedHashSet<>();

        if (request.getImageUrls() != null) {
            for (String imageUrl : request.getImageUrls()) {
                if (imageUrl == null) {
                    continue;
                }
                String value = imageUrl.trim();
                if (!value.isBlank()) {
                    normalized.add(value);
                }
            }
        }

        if (normalized.isEmpty() && request.getImageUrl() != null) {
            String legacySingleImage = request.getImageUrl().trim();
            if (!legacySingleImage.isBlank()) {
                normalized.add(legacySingleImage);
            }
        }

        if (normalized.size() > MAX_PRODUCT_IMAGES) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Product images must not exceed " + MAX_PRODUCT_IMAGES + " items");
        }

        return new ArrayList<>(normalized);
    }

    private void syncImages(Product product, List<String> imageUrls) {
        if (imageUrls == null) {
            return;
        }

        List<ProductImage> images = ensureImageList(product);
        images.clear();

        for (int index = 0; index < imageUrls.size(); index++) {
            String imageUrl = imageUrls.get(index);
            if (imageUrl == null || imageUrl.isBlank()) {
                continue;
            }
            ProductImage image = ProductImage.builder()
                    .product(product)
                    .url(imageUrl.trim())
                    .alt(product.getName())
                    .sortOrder(index)
                    .isPrimary(index == 0)
                    .build();
            images.add(image);
        }
    }

    private boolean hasVariantPayload(ProductRequest request) {
        return request.getVariants() != null && !request.getVariants().isEmpty();
    }

    private void syncVariants(Product product, ProductRequest request) {
        if (!hasVariantPayload(request)) {
            syncPrimaryVariant(product, request.getSku(), request.getStockQuantity());
            return;
        }

        List<ProductVariant> normalizedVariants = new ArrayList<>();
        Set<String> seenSkus = new HashSet<>();

        for (ProductRequest.VariantRequest item : request.getVariants()) {
            if (item == null) {
                continue;
            }

            String normalizedSku = item.getSku() == null ? "" : item.getSku().trim().toUpperCase(Locale.ROOT);
            if (normalizedSku.isBlank()) {
                normalizedSku = generateSystemSku(seenSkus);
            } else if (!seenSkus.add(normalizedSku)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Duplicate SKU in variant matrix: " + normalizedSku);
            }

            ProductVariant variant = ProductVariant.builder()
                    .product(product)
                    .sku(normalizedSku)
                    .color(item.getColor() == null || item.getColor().isBlank() ? "Default" : item.getColor().trim())
                    .colorHex(normalizeColorHex(item.getColorHex()))
                    .size(item.getSize() == null || item.getSize().isBlank() ? "Default" : item.getSize().trim())
                    .stockQuantity(Math.max(0, item.getStockQuantity() == null ? 0 : item.getStockQuantity()))
                    .priceAdjustment(item.getPriceAdjustment() == null ? BigDecimal.ZERO : item.getPriceAdjustment())
                    .isActive(item.getIsActive() == null ? true : item.getIsActive())
                    .build();
            normalizedVariants.add(variant);
        }

        if (normalizedVariants.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Variant matrix is empty");
        }

        List<ProductVariant> variants = ensureVariantList(product);
        variants.clear();
        variants.addAll(normalizedVariants);
    }

    private void syncPrimaryVariant(Product product, String sku, Integer stockQuantity) {
        if ((sku == null || sku.isBlank()) && stockQuantity == null) {
            return;
        }

        List<ProductVariant> variants = ensureVariantList(product);

        ProductVariant variant = variants.stream()
                .filter(existing -> Boolean.TRUE.equals(existing.getIsActive()))
                .findFirst()
                .orElseGet(() -> variants.stream().findFirst().orElse(null));

        if (variant == null) {
            String fallbackSku = sku != null && !sku.isBlank()
                    ? sku.trim().toUpperCase(Locale.ROOT)
                    : generateSystemSku(new HashSet<>());
            ProductVariant newVariant = ProductVariant.builder()
                    .product(product)
                    .sku(fallbackSku)
                    .color("Default")
                    .colorHex(null)
                    .size("Default")
                    .stockQuantity(Math.max(0, stockQuantity == null ? 0 : stockQuantity))
                    .priceAdjustment(BigDecimal.ZERO)
                    .isActive(true)
                    .build();
            variants.add(newVariant);
            return;
        }

        if (sku != null && !sku.isBlank()) {
            variant.setSku(sku.trim().toUpperCase(Locale.ROOT));
        } else if (variant.getSku() == null || variant.getSku().isBlank()) {
            variant.setSku(generateSystemSku(new HashSet<>()));
        }
        if (stockQuantity != null) {
            variant.setStockQuantity(Math.max(0, stockQuantity));
        }
        if (variant.getColor() == null || variant.getColor().isBlank()) {
            variant.setColor("Default");
        }
        if (variant.getColorHex() == null || variant.getColorHex().isBlank()) {
            variant.setColorHex(normalizeColorHex(variant.getColor()));
        } else {
            variant.setColorHex(normalizeColorHex(variant.getColorHex()));
        }
        if (variant.getSize() == null || variant.getSize().isBlank()) {
            variant.setSize("Default");
        }
        if (variant.getPriceAdjustment() == null) {
            variant.setPriceAdjustment(BigDecimal.ZERO);
        }
        if (variant.getIsActive() == null) {
            variant.setIsActive(true);
        }
    }

    private void clearVendorProvidedSku(ProductRequest request) {
        if (request == null) {
            return;
        }

        request.setSku(null);
        if (request.getVariants() == null) {
            return;
        }

        for (ProductRequest.VariantRequest variant : request.getVariants()) {
            if (variant == null) {
                continue;
            }
            variant.setSku(null);
        }
    }

    private String generateSystemSku(Set<String> reservedSkus) {
        for (int attempt = 0; attempt < 32; attempt++) {
            String candidate = "SKU-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
            if (reservedSkus.contains(candidate)) {
                continue;
            }
            if (productVariantRepository.findBySku(candidate).isPresent()) {
                continue;
            }
            reservedSkus.add(candidate);
            return candidate;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Unable to generate unique SKU");
    }

    // ─── Delete (With ownership validation) ────────────────────────────────────

    /**
     * Legacy delete - no ownership check (admin only)
     */
    @Transactional
    public void delete(UUID id) {
        Product product = findByIdIncludingInactive(id);
        product.setStatus(ProductStatus.ARCHIVED);
        productRepository.save(product);
    }

    /**
     * Delete product with ownership validation (vendor operation)
     * 
     * @throws ForbiddenException if vendor doesn't own the product
     */
    @Transactional
    public void deleteForStore(UUID id, UUID storeId) {
        Product product = productRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(
                        () -> new ForbiddenException("Product not found or you don't have permission to delete it"));
        ensureVendorCanMutate(product, "deleted");

        product.setStatus(ProductStatus.ARCHIVED);
        productRepository.save(product);
    }

    public VendorProductSummaryResponse toVendorProductSummaryResponse(Product product) {
        return toVendorProductSummaryResponse(product, null, null);
    }

    private VendorProductSummaryResponse toVendorProductSummaryResponse(
            Product product,
            ProductSalesSnapshot salesSnapshot,
            String moderationReason) {
        List<ProductVariant> variants = ensureVariantList(product);
        List<ProductImage> images = ensureImageList(product);

        String primarySku = variants.stream()
                .filter(variant -> Boolean.TRUE.equals(variant.getIsActive()))
                .map(ProductVariant::getSku)
                .filter(sku -> sku != null && !sku.isBlank())
                .findFirst()
                .orElse("");

        Integer totalStock = variants.stream()
                .filter(variant -> Boolean.TRUE.equals(variant.getIsActive()))
                .map(ProductVariant::getStockQuantity)
                .filter(quantity -> quantity != null && quantity > 0)
                .reduce(0, Integer::sum);

        List<String> orderedImages = images.stream()
                .sorted(
                        java.util.Comparator
                                .comparing((ProductImage image) -> !Boolean.TRUE.equals(image.getIsPrimary()))
                                .thenComparing(image -> image.getSortOrder() == null ? Integer.MAX_VALUE
                                        : image.getSortOrder()))
                .map(ProductImage::getUrl)
                .filter(url -> url != null && !url.isBlank())
                .toList();
        String primaryImage = orderedImages.isEmpty() ? null : orderedImages.get(0);
        long soldCount = salesSnapshot != null ? salesSnapshot.soldCount() : 0L;
        BigDecimal grossRevenue = salesSnapshot != null ? salesSnapshot.grossRevenue() : BigDecimal.ZERO;
        List<VendorProductSummaryResponse.VariantRow> variantRows = variants.stream()
                .map(variant -> VendorProductSummaryResponse.VariantRow.builder()
                        .id(variant.getId())
                        .sku(variant.getSku())
                        .color(variant.getColor())
                        .colorHex(variant.getColorHex())
                        .size(variant.getSize())
                        .stockQuantity(variant.getStockQuantity())
                        .priceAdjustment(variant.getPriceAdjustment())
                        .isActive(variant.getIsActive())
                        .build())
                .toList();

        return VendorProductSummaryResponse.builder()
                .id(product.getId())
                .name(product.getName())
                .slug(product.getSlug())
                .description(product.getDescription())
                .sizeAndFit(firstNonBlank(product.getSizeAndFit(), product.getHighlights()))
                .fabricAndCare(
                        firstNonBlank(product.getFabricAndCare(), product.getCareInstructions(), product.getMaterial()))
                .highlights(firstNonBlank(product.getSizeAndFit(), product.getHighlights()))
                .material(null)
                .fit(product.getFit())
                .gender(product.getGender() == null ? null : product.getGender().name())
                .careInstructions(
                        firstNonBlank(product.getFabricAndCare(), product.getCareInstructions(), product.getMaterial()))
                .status(product.getStatus() == null ? null : product.getStatus().name())
                .approvalStatus(product.getApprovalStatus() == null ? null : product.getApprovalStatus().name())
                .moderationReason(visibleModerationReason(product, moderationReason))
                .visible(isVendorProductVisible(product))
                .categoryId(product.getCategory() != null ? product.getCategory().getId() : null)
                .categoryName(product.getCategory() != null ? product.getCategory().getName() : null)
                .basePrice(product.getBasePrice())
                .salePrice(product.getSalePrice())
                .effectivePrice(product.getEffectivePrice())
                .totalStock(totalStock)
                .soldCount(soldCount)
                .grossRevenue(grossRevenue)
                .primarySku(primarySku)
                .primaryImage(primaryImage)
                .images(orderedImages)
                .variants(variantRows)
                .createdAt(product.getCreatedAt())
                .updatedAt(product.getUpdatedAt())
                .build();
    }

    private Map<UUID, String> loadVendorBlockReasons(List<Product> products) {
        List<UUID> blockedProductIds = products.stream()
                .filter(product -> product != null && product.getId() != null)
                .filter(this::isVendorBlockedProduct)
                .map(Product::getId)
                .toList();
        if (blockedProductIds.isEmpty()) {
            return Map.of();
        }

        Map<UUID, String> reasonsByProductId = new LinkedHashMap<>();
        productAuditLogRepository.findVendorBlockReasonCandidates(blockedProductIds, VENDOR_BLOCK_REASON_ACTIONS)
                .forEach(log -> {
                    String reason = normalizeOptionalText(log.getReason());
                    if (reason != null) {
                        reasonsByProductId.putIfAbsent(log.getProductId(), reason);
                    }
                });
        return reasonsByProductId;
    }

    private String visibleModerationReason(Product product, String moderationReason) {
        if (!isVendorBlockedProduct(product)) {
            return null;
        }
        return moderationReason == null || moderationReason.isBlank()
                ? "Sản phẩm bị quản trị viên chặn. Vui lòng liên hệ hỗ trợ để biết thêm chi tiết."
                : moderationReason;
    }

    private boolean isVendorProductVisible(Product product) {
        boolean active = product.getStatus() == ProductStatus.ACTIVE;
        boolean approved = product.getApprovalStatus() == null
                || product.getApprovalStatus() == Product.ApprovalStatus.APPROVED;
        return active && approved;
    }

    private boolean isVendorBlockedProduct(Product product) {
        return product.getApprovalStatus() == Product.ApprovalStatus.BANNED
                || product.getApprovalStatus() == Product.ApprovalStatus.REJECTED;
    }

    private void ensureVendorCanMutate(Product product, String action) {
        if (isVendorBlockedProduct(product)) {
            throw new ForbiddenException("Product is blocked by admin and cannot be " + action + " by vendor");
        }
    }

    private String resolveSizeAndFit(ProductRequest request) {
        return firstNonBlank(request.getSizeAndFit(), request.getHighlights());
    }

    private String resolveFabricAndCare(ProductRequest request) {
        String combined = firstNonBlank(request.getFabricAndCare());
        if (combined != null) {
            return combined;
        }

        String material = normalizeNullable(request.getMaterial());
        String care = normalizeNullable(request.getCareInstructions());
        if (material == null && care == null) {
            return null;
        }
        if (material == null) {
            return care;
        }
        if (care == null) {
            return material;
        }
        return material + "\n" + care;
    }

    private String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isBlank() ? null : normalized;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            String normalized = normalizeNullable(value);
            if (normalized != null) {
                return normalized;
            }
        }
        return null;
    }

    private Map<UUID, ProductSalesSnapshot> loadDeliveredSalesByProduct(List<Product> products, UUID storeId) {
        if (products == null || products.isEmpty()) {
            return Map.of();
        }

        List<UUID> productIds = products.stream()
                .filter(product -> product != null)
                .map(Product::getId)
                .filter(id -> id != null)
                .toList();
        if (productIds.isEmpty()) {
            return Map.of();
        }

        return orderRepository.findDeliveredProductSalesByStoreAndProductIds(storeId, productIds).stream()
                .collect(java.util.stream.Collectors.toMap(
                        OrderRepository.ProductSalesProjection::getProductId,
                        row -> new ProductSalesSnapshot(
                                row.getSoldCount() == null ? 0L : row.getSoldCount(),
                                row.getGrossRevenue() == null ? BigDecimal.ZERO : row.getGrossRevenue())));
    }

    private void attachDeliveredSales(Product product) {
        if (product == null) {
            return;
        }
        attachDeliveredSales(List.of(product));
    }

    private void attachDeliveredSales(List<Product> products) {
        Map<UUID, ProductSalesSnapshot> salesByProductId = loadDeliveredSalesByProduct(products);
        for (Product product : products) {
            if (product == null) {
                continue;
            }
            ProductSalesSnapshot snapshot = salesByProductId.get(product.getId());
            product.setSoldCount(snapshot == null ? 0L : snapshot.soldCount());
        }
    }

    private Map<UUID, ProductSalesSnapshot> loadDeliveredSalesByProduct(List<Product> products) {
        if (products == null || products.isEmpty()) {
            return Map.of();
        }

        List<UUID> productIds = products.stream()
                .filter(product -> product != null)
                .map(Product::getId)
                .filter(id -> id != null)
                .toList();
        if (productIds.isEmpty()) {
            return Map.of();
        }

        return orderRepository.findDeliveredProductSalesByProductIds(productIds).stream()
                .collect(java.util.stream.Collectors.toMap(
                        OrderRepository.ProductSalesProjection::getProductId,
                        row -> new ProductSalesSnapshot(
                                row.getSoldCount() == null ? 0L : row.getSoldCount(),
                                row.getGrossRevenue() == null ? BigDecimal.ZERO : row.getGrossRevenue())));
    }

    private void validateBasicRequest(ProductRequest request) {
        if (request.getBasePrice() != null && request.getBasePrice().compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Base price must be greater than or equal to 0");
        }

        if (request.getSalePrice() != null && request.getSalePrice().compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sale price must be greater than or equal to 0");
        }

        if (request.getStockQuantity() != null && request.getStockQuantity() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Stock quantity must be greater than or equal to 0");
        }

        if (request.getVariants() != null) {
            for (ProductRequest.VariantRequest variant : request.getVariants()) {
                if (variant == null) {
                    continue;
                }
                if (variant.getStockQuantity() != null && variant.getStockQuantity() < 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Variant stock quantity must be greater than or equal to 0");
                }
            }
        }
    }

    private void validatePublishRules(Product product, ProductStatus status) {
        if (status != ProductStatus.ACTIVE) {
            return;
        }

        if (product.getName() == null || product.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Product name is required before publishing");
        }

        if (product.getCategory() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is required before publishing");
        }

        if (categoryRepository.existsByParentId(product.getCategory().getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Please choose a leaf category before publishing");
        }

        BigDecimal effectivePrice = product.getEffectivePrice();
        if (effectivePrice == null || effectivePrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Price must be greater than 0 before publishing");
        }

        boolean hasPrimaryImage = ensureImageList(product).stream()
                .map(ProductImage::getUrl)
                .anyMatch(url -> url != null && !url.isBlank());
        if (!hasPrimaryImage) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Primary image is required before publishing");
        }

        boolean hasSku = ensureVariantList(product).stream()
                .filter(variant -> Boolean.TRUE.equals(variant.getIsActive()))
                .map(ProductVariant::getSku)
                .anyMatch(sku -> sku != null && !sku.isBlank());
        if (!hasSku) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "SKU is required before publishing");
        }
    }

    private void validateSlugUniquenessForCreate(String slug) {
        if (slug == null || slug.isBlank()) {
            return;
        }

        if (productRepository.existsBySlugIgnoreCase(slug.trim())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Slug already exists");
        }
    }

    private void validateSlugUniquenessForUpdate(String slug, UUID productId) {
        if (slug == null || slug.isBlank()) {
            return;
        }

        if (productRepository.existsBySlugIgnoreCaseAndIdNot(slug.trim(), productId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Slug already exists");
        }
    }

    private void validateSkuUniqueness(Product product, UUID productId) {
        Set<String> requestedSkus = ensureVariantList(product).stream()
                .map(ProductVariant::getSku)
                .filter(sku -> sku != null && !sku.isBlank())
                .map(sku -> sku.trim().toUpperCase(Locale.ROOT))
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));

        if (requestedSkus.isEmpty()) {
            return;
        }

        UUID effectiveProductId = productId != null ? productId : product.getId();
        for (String requestedSku : requestedSkus) {
            if (effectiveProductId == null) {
                productVariantRepository.findBySku(requestedSku)
                        .ifPresent(variant -> {
                            throw new ResponseStatusException(HttpStatus.CONFLICT, "SKU already exists in marketplace");
                        });
                continue;
            }

            productVariantRepository.findConflictingSku(requestedSku, effectiveProductId)
                    .ifPresent(variant -> {
                        throw new ResponseStatusException(HttpStatus.CONFLICT, "SKU already exists in marketplace");
                    });
        }
    }

    private String normalizeKeyword(String keyword) {
        if (keyword == null) {
            return null;
        }

        String normalized = keyword.trim().toLowerCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeOptionalText(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeColorHex(String rawColorHex) {
        if (rawColorHex == null) {
            return null;
        }

        String normalized = rawColorHex.trim();
        if (normalized.isBlank()) {
            return null;
        }
        if (!normalized.startsWith("#")) {
            normalized = "#" + normalized;
        }
        if (!normalized.matches("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")) {
            return null;
        }
        if (normalized.length() == 4) {
            char r = normalized.charAt(1);
            char g = normalized.charAt(2);
            char b = normalized.charAt(3);
            normalized = "#" + r + r + g + g + b + b;
        }
        return normalized.toLowerCase(Locale.ROOT);
    }

    private Category resolveLeafCategoryOrThrow(UUID categoryId) {
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found"));

        if (categoryRepository.existsByParentId(category.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please choose a leaf category");
        }

        return category;
    }

    private List<ProductImage> ensureImageList(Product product) {
        if (product.getImages() == null) {
            product.setImages(new ArrayList<>());
        }
        return product.getImages();
    }

    private List<ProductVariant> ensureVariantList(Product product) {
        if (product.getVariants() == null) {
            product.setVariants(new ArrayList<>());
        }
        return product.getVariants();
    }
}
