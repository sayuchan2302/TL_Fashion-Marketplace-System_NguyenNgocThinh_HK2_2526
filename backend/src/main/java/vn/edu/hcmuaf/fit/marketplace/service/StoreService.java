package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.dto.request.StoreRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.PublicStoreResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.StoreResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReviewRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;

import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class StoreService {

    private final StoreRepository storeRepository;
    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final ReviewRepository reviewRepository;
    private final StorePerformanceMetricsService storePerformanceMetricsService;
    private final AdminAuditLogService adminAuditLogService;
    private final PlatformCommissionSettingsService platformCommissionSettingsService;

    @Autowired
    public StoreService(
            StoreRepository storeRepository,
            UserRepository userRepository,
            ProductRepository productRepository,
            ReviewRepository reviewRepository,
            StorePerformanceMetricsService storePerformanceMetricsService,
            AdminAuditLogService adminAuditLogService,
            PlatformCommissionSettingsService platformCommissionSettingsService
    ) {
        this.storeRepository = storeRepository;
        this.userRepository = userRepository;
        this.productRepository = productRepository;
        this.reviewRepository = reviewRepository;
        this.storePerformanceMetricsService = storePerformanceMetricsService;
        this.adminAuditLogService = adminAuditLogService;
        this.platformCommissionSettingsService = platformCommissionSettingsService;
    }

    public StoreService(
            StoreRepository storeRepository,
            UserRepository userRepository,
            ProductRepository productRepository,
            ReviewRepository reviewRepository,
            StorePerformanceMetricsService storePerformanceMetricsService
    ) {
        this(storeRepository, userRepository, productRepository, reviewRepository, storePerformanceMetricsService, null, null);
    }

    public StoreService(
            StoreRepository storeRepository,
            UserRepository userRepository,
            ProductRepository productRepository,
            ReviewRepository reviewRepository,
            StorePerformanceMetricsService storePerformanceMetricsService,
            AdminAuditLogService adminAuditLogService
    ) {
        this(storeRepository, userRepository, productRepository, reviewRepository, storePerformanceMetricsService, adminAuditLogService, null);
    }

    private static final Pattern SLUG_PATTERN = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");

    @Transactional
    public StoreResponse registerStore(UUID userId, StoreRequest request) {
        User owner = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (storeRepository.findByOwnerId(userId).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User already has a store");
        }

        if (storeRepository.existsByName(request.getName())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Store name already exists");
        }

        String slug = generateSlug(request.getSlug() != null ? request.getSlug() : request.getName());
        if (storeRepository.existsBySlug(slug)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Store URL already exists");
        }

        Store store = Store.builder()
                .owner(owner)
                .name(request.getName())
                .slug(slug)
                .description(request.getDescription())
                .logo(request.getLogo())
                .banner(request.getBanner())
                .contactEmail(request.getContactEmail() != null ? request.getContactEmail() : owner.getEmail())
                .phone(request.getPhone())
                .address(request.getAddress())
                .bankName(request.getBankName())
                .bankAccountNumber(request.getBankAccountNumber())
                .bankAccountHolder(request.getBankAccountHolder())
                .bankVerified(false)
                .notifyNewOrder(defaultIfNull(request.getNotifyNewOrder(), true))
                .notifyOrderStatusChange(defaultIfNull(request.getNotifyOrderStatusChange(), true))
                .notifyLowStock(defaultIfNull(request.getNotifyLowStock(), true))
                .notifyPayoutComplete(defaultIfNull(request.getNotifyPayoutComplete(), true))
                .notifyPromotions(defaultIfNull(request.getNotifyPromotions(), false))
                .shipGhn(defaultIfNull(request.getShipGhn(), true))
                .shipGhtk(defaultIfNull(request.getShipGhtk(), true))
                .shipExpress(defaultIfNull(request.getShipExpress(), false))
                .warehouseAddress(request.getWarehouseAddress() != null ? request.getWarehouseAddress() : request.getAddress())
                .warehouseContact(request.getWarehouseContact())
                .warehousePhone(request.getWarehousePhone() != null ? request.getWarehousePhone() : request.getPhone())
                .commissionRate(null)
                .usesDefaultCommissionRate(true)
                .status(Store.StoreStatus.INACTIVE)
                .approvalStatus(Store.ApprovalStatus.PENDING)
                .totalSales(BigDecimal.ZERO)
                .totalOrders(0)
                .rating(0.0)
                .build();

        Store saved = storeRepository.save(store);

        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public StoreResponse getStoreByOwner(UUID userId) {
        return findStoreByOwner(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Store not found"));
    }

    @Transactional(readOnly = true)
    public Optional<StoreResponse> findStoreByOwner(UUID userId) {
        return storeRepository.findByOwnerId(userId).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public PublicStoreResponse getStoreById(UUID storeId) {
        Store store = storeRepository.findByIdAndApprovalStatusAndStatus(
                        storeId,
                        Store.ApprovalStatus.APPROVED,
                        Store.StoreStatus.ACTIVE
                )
                .orElseThrow(() -> new ResourceNotFoundException("Store not found"));
        return toPublicResponse(store, true);
    }

    @Transactional(readOnly = true)
    public PublicStoreResponse getStoreBySlug(String slug) {
        Store store = storeRepository.findBySlugAndApprovalStatusAndStatus(
                        slug,
                        Store.ApprovalStatus.APPROVED,
                        Store.StoreStatus.ACTIVE
                )
                .orElseThrow(() -> new ResourceNotFoundException("Store not found"));
        return toPublicResponse(store, true);
    }

    @Transactional(readOnly = true)
    public List<StoreResponse> getPendingStores() {
        return storeRepository.findByApprovalStatus(Store.ApprovalStatus.PENDING)
                .stream()
                .map(store -> toResponse(store, true))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<StoreResponse> getAllStoresForAdmin() {
        return storeRepository.findAll()
                .stream()
                .map(store -> toResponse(store, true))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<PublicStoreResponse> getAllActiveStores() {
        return storeRepository.findByApprovalStatusAndStatus(
                Store.ApprovalStatus.APPROVED,
                Store.StoreStatus.ACTIVE
        ).stream()
                .map(store -> toPublicResponse(store, false))
                .collect(Collectors.toList());
    }

    @Transactional
    public StoreResponse approveStore(UUID storeId, UUID adminId, String adminEmail) {
        try {
            Store store = storeRepository.findById(storeId)
                    .orElseThrow(() -> new ResourceNotFoundException("Store not found"));

            if (store.getApprovalStatus() != Store.ApprovalStatus.PENDING) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Store is not pending approval");
            }

            store.setApprovalStatus(Store.ApprovalStatus.APPROVED);
            store.setStatus(Store.StoreStatus.ACTIVE);
            store.setApprovedAt(LocalDateTime.now());
            store.setApprovedBy(adminEmail);

            Store saved = storeRepository.save(store);
            User owner = store.getOwner();
            owner.setRole(User.Role.VENDOR);
            owner.setStoreId(saved.getId());
            userRepository.save(owner);

            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "APPROVE_STORE",
                    saved.getId(),
                    true,
                    null
            );
            return toResponse(saved);
        } catch (RuntimeException ex) {
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "APPROVE_STORE",
                    storeId,
                    false,
                    ex.getMessage()
            );
            throw ex;
        }
    }

    @Transactional
    public StoreResponse rejectStore(UUID storeId, UUID adminId, String adminEmail, String reason) {
        try {
            Store store = storeRepository.findById(storeId)
                    .orElseThrow(() -> new ResourceNotFoundException("Store not found"));

            if (store.getApprovalStatus() != Store.ApprovalStatus.PENDING) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Store is not pending approval");
            }

            store.setApprovalStatus(Store.ApprovalStatus.REJECTED);
            store.setRejectionReason(reason);

            Store saved = storeRepository.save(store);
            User owner = store.getOwner();
            owner.setRole(User.Role.CUSTOMER);
            owner.setStoreId(null);
            userRepository.save(owner);

            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "REJECT_STORE",
                    saved.getId(),
                    true,
                    reason
            );
            return toResponse(saved);
        } catch (RuntimeException ex) {
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "REJECT_STORE",
                    storeId,
                    false,
                    ex.getMessage()
            );
            throw ex;
        }
    }

    @Transactional
    public StoreResponse suspendStore(UUID storeId, UUID adminId, String adminEmail) {
        try {
            Store store = storeRepository.findById(storeId)
                    .orElseThrow(() -> new ResourceNotFoundException("Store not found"));

            if (store.getApprovalStatus() != Store.ApprovalStatus.APPROVED) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only approved stores can be suspended");
            }

            store.setStatus(Store.StoreStatus.SUSPENDED);
            Store saved = storeRepository.save(store);
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "SUSPEND_STORE",
                    saved.getId(),
                    true,
                    null
            );
            return toResponse(saved);
        } catch (RuntimeException ex) {
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "SUSPEND_STORE",
                    storeId,
                    false,
                    ex.getMessage()
            );
            throw ex;
        }
    }

    @Transactional
    public StoreResponse reactivateStore(UUID storeId, UUID adminId, String adminEmail) {
        try {
            Store store = storeRepository.findById(storeId)
                    .orElseThrow(() -> new ResourceNotFoundException("Store not found"));

            if (store.getApprovalStatus() != Store.ApprovalStatus.APPROVED) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only approved stores can be reactivated");
            }

            store.setStatus(Store.StoreStatus.ACTIVE);
            Store saved = storeRepository.save(store);
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "REACTIVATE_STORE",
                    saved.getId(),
                    true,
                    null
            );
            return toResponse(saved);
        } catch (RuntimeException ex) {
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "REACTIVATE_STORE",
                    storeId,
                    false,
                    ex.getMessage()
            );
            throw ex;
        }
    }

    @Transactional
    public StoreResponse updateStore(UUID userId, StoreRequest request) {
        Store store = storeRepository.findByOwnerId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Store not found"));

        if (request.getName() != null && !request.getName().equals(store.getName())) {
            if (storeRepository.existsByName(request.getName())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Store name already exists");
            }
            store.setName(request.getName());
        }

        if (request.getDescription() != null) {
            store.setDescription(request.getDescription());
        }
        if (request.getLogo() != null) {
            store.setLogo(request.getLogo());
        }
        if (request.getBanner() != null) {
            store.setBanner(request.getBanner());
        }
        if (request.getContactEmail() != null) {
            store.setContactEmail(request.getContactEmail());
        }
        if (request.getPhone() != null) {
            store.setPhone(request.getPhone());
        }
        if (request.getAddress() != null) {
            store.setAddress(request.getAddress());
        }
        if (request.getBankName() != null) {
            store.setBankName(request.getBankName());
        }
        if (request.getBankAccountNumber() != null) {
            store.setBankAccountNumber(request.getBankAccountNumber());
        }
        if (request.getBankAccountHolder() != null) {
            store.setBankAccountHolder(request.getBankAccountHolder());
        }
        if (request.getNotifyNewOrder() != null) {
            store.setNotifyNewOrder(request.getNotifyNewOrder());
        }
        if (request.getNotifyOrderStatusChange() != null) {
            store.setNotifyOrderStatusChange(request.getNotifyOrderStatusChange());
        }
        if (request.getNotifyLowStock() != null) {
            store.setNotifyLowStock(request.getNotifyLowStock());
        }
        if (request.getNotifyPayoutComplete() != null) {
            store.setNotifyPayoutComplete(request.getNotifyPayoutComplete());
        }
        if (request.getNotifyPromotions() != null) {
            store.setNotifyPromotions(request.getNotifyPromotions());
        }
        if (request.getShipGhn() != null) {
            store.setShipGhn(request.getShipGhn());
        }
        if (request.getShipGhtk() != null) {
            store.setShipGhtk(request.getShipGhtk());
        }
        if (request.getShipExpress() != null) {
            store.setShipExpress(request.getShipExpress());
        }
        if (request.getWarehouseAddress() != null) {
            store.setWarehouseAddress(request.getWarehouseAddress());
        }
        if (request.getWarehouseContact() != null) {
            store.setWarehouseContact(request.getWarehouseContact());
        }
        if (request.getWarehousePhone() != null) {
            store.setWarehousePhone(request.getWarehousePhone());
        }

        Store saved = storeRepository.save(store);
        return toResponse(saved);
    }

    @Transactional
    public StoreResponse updateBankVerification(
            UUID storeId,
            Boolean bankVerified,
            UUID adminId,
            String adminEmail,
            String note
    ) {
        if (bankVerified == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bankVerified is required");
        }
        try {
            Store store = storeRepository.findById(storeId)
                    .orElseThrow(() -> new ResourceNotFoundException("Store not found"));

            store.setBankVerified(bankVerified);
            Store saved = storeRepository.save(store);

            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "UPDATE_BANK_VERIFICATION",
                    saved.getId(),
                    true,
                    note
            );
            return toResponse(saved);
        } catch (RuntimeException ex) {
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "UPDATE_BANK_VERIFICATION",
                    storeId,
                    false,
                    ex.getMessage()
            );
            throw ex;
        }
    }

    @Transactional
    public StoreResponse updateCommissionRateAsAdmin(
            UUID storeId,
            BigDecimal commissionRate,
            UUID adminId,
            String adminEmail
    ) {
        return updateCommissionRateAsAdmin(storeId, commissionRate, adminId, adminEmail, null);
    }

    @Transactional
    public StoreResponse updateCommissionRateAsAdmin(
            UUID storeId,
            BigDecimal commissionRate,
            UUID adminId,
            String adminEmail,
            String note
    ) {
        validateCommissionRate(commissionRate);
        try {
            Store store = storeRepository.findById(storeId)
                    .orElseThrow(() -> new ResourceNotFoundException("Store not found"));

            BigDecimal normalizedRate = commissionRate.stripTrailingZeros();
            store.setCommissionRate(normalizedRate);
            store.setUsesDefaultCommissionRate(false);
            Store saved = storeRepository.save(store);

            String auditNote = note != null && !note.isBlank()
                    ? note + " | rate=" + normalizedRate.toPlainString() + "%"
                    : "rate=" + normalizedRate.toPlainString() + "%";
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "UPDATE_COMMISSION_RATE",
                    saved.getId(),
                    true,
                    auditNote
            );
            return toResponse(saved);
        } catch (RuntimeException ex) {
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "UPDATE_COMMISSION_RATE",
                    storeId,
                    false,
                    ex.getMessage()
            );
            throw ex;
        }
    }

    @Transactional
    public StoreResponse resetCommissionRateToDefaultAsAdmin(
            UUID storeId,
            UUID adminId,
            String adminEmail
    ) {
        return resetCommissionRateToDefaultAsAdmin(storeId, adminId, adminEmail, null);
    }

    @Transactional
    public StoreResponse resetCommissionRateToDefaultAsAdmin(
            UUID storeId,
            UUID adminId,
            String adminEmail,
            String note
    ) {
        try {
            Store store = storeRepository.findById(storeId)
                    .orElseThrow(() -> new ResourceNotFoundException("Store not found"));

            store.setUsesDefaultCommissionRate(true);
            store.setCommissionRate(null);
            Store saved = storeRepository.save(store);

            BigDecimal defaultRate = resolveEffectiveCommissionRate(saved);
            String auditNote = note != null && !note.isBlank()
                    ? note + " | defaultRate=" + defaultRate.toPlainString() + "%"
                    : "defaultRate=" + defaultRate.toPlainString() + "%";
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "RESET_COMMISSION_RATE_DEFAULT",
                    saved.getId(),
                    true,
                    auditNote
            );
            return toResponse(saved);
        } catch (RuntimeException ex) {
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "STORE",
                    "RESET_COMMISSION_RATE_DEFAULT",
                    storeId,
                    false,
                    ex.getMessage()
            );
            throw ex;
        }
    }

    private String generateSlug(String input) {
        if (input == null || input.isBlank()) {
            return "";
        }
        String slug = input.toLowerCase()
                .replaceAll("\\s+", "-")
                .replaceAll("[^a-z0-9-]", "");
        if (!SLUG_PATTERN.matcher(slug).matches()) {
            slug = slug.replaceAll("-+", "-");
        }
        return slug;
    }

    private StoreResponse toResponse(Store store) {
        return toResponse(store, false);
    }

    private PublicStoreResponse toPublicResponse(Store store, boolean includeAggregates) {
        Integer productCount = null;
        Integer liveProductCount = null;
        Integer responseRate = null;
        StorePerformanceMetricsService.StorePerformanceMetrics performanceMetrics =
                storePerformanceMetricsService.resolve(store.getId());

        if (includeAggregates) {
            UUID storeId = store.getId();
            long totalProducts = productRepository.countByStoreIdExcludingArchived(storeId);
            long activeProducts = productRepository.countActiveByStoreId(storeId);
            long totalReviews = reviewRepository.countByStoreId(storeId);
            long repliedReviews = reviewRepository.countByStoreIdWithReply(storeId);

            productCount = Math.toIntExact(totalProducts);
            liveProductCount = Math.toIntExact(activeProducts);
            responseRate = totalReviews == 0
                    ? 0
                    : (int) Math.round((repliedReviews * 100.0) / totalReviews);
        }

        return PublicStoreResponse.builder()
                .id(store.getId())
                .name(store.getName())
                .slug(store.getSlug())
                .description(store.getDescription())
                .logo(store.getLogo())
                .banner(store.getBanner())
                .contactEmail(store.getContactEmail())
                .phone(store.getPhone())
                .address(store.getAddress())
                .status(store.getStatus().name())
                .approvalStatus(store.getApprovalStatus().name())
                .totalSales(performanceMetrics.totalSales())
                .totalOrders(performanceMetrics.totalOrders())
                .rating(store.getRating())
                .productCount(productCount)
                .liveProductCount(liveProductCount)
                .responseRate(responseRate)
                .createdAt(store.getCreatedAt())
                .updatedAt(store.getUpdatedAt())
                .build();
    }

    private StoreResponse toResponse(Store store, boolean includeAggregates) {
        // Ensure owner is initialized within transactional context
        User owner = store.getOwner();
        Integer productCount = null;
        Integer liveProductCount = null;
        Integer responseRate = null;
        StorePerformanceMetricsService.StorePerformanceMetrics performanceMetrics =
                storePerformanceMetricsService.resolve(store.getId());

        if (includeAggregates) {
            UUID storeId = store.getId();
            long totalProducts = productRepository.countByStoreIdExcludingArchived(storeId);
            long activeProducts = productRepository.countActiveByStoreId(storeId);
            long totalReviews = reviewRepository.countByStoreId(storeId);
            long repliedReviews = reviewRepository.countByStoreIdWithReply(storeId);

            productCount = Math.toIntExact(totalProducts);
            liveProductCount = Math.toIntExact(activeProducts);
            responseRate = totalReviews == 0
                    ? 0
                    : (int) Math.round((repliedReviews * 100.0) / totalReviews);
        }

        return StoreResponse.builder()
                .id(store.getId())
                .ownerId(owner.getId())
                .ownerName(owner.getName())
                .ownerEmail(owner.getEmail())
                .name(store.getName())
                .slug(store.getSlug())
                .description(store.getDescription())
                .logo(store.getLogo())
                .banner(store.getBanner())
                .contactEmail(store.getContactEmail())
                .phone(store.getPhone())
                .address(store.getAddress())
                .bankName(store.getBankName())
                .bankAccountNumber(store.getBankAccountNumber())
                .bankAccountHolder(store.getBankAccountHolder())
                .bankVerified(defaultIfNull(store.getBankVerified(), false))
                .notifyNewOrder(defaultIfNull(store.getNotifyNewOrder(), true))
                .notifyOrderStatusChange(defaultIfNull(store.getNotifyOrderStatusChange(), true))
                .notifyLowStock(defaultIfNull(store.getNotifyLowStock(), true))
                .notifyPayoutComplete(defaultIfNull(store.getNotifyPayoutComplete(), true))
                .notifyPromotions(defaultIfNull(store.getNotifyPromotions(), false))
                .shipGhn(defaultIfNull(store.getShipGhn(), true))
                .shipGhtk(defaultIfNull(store.getShipGhtk(), true))
                .shipExpress(defaultIfNull(store.getShipExpress(), false))
                .warehouseAddress(store.getWarehouseAddress())
                .warehouseContact(store.getWarehouseContact())
                .warehousePhone(store.getWarehousePhone())
                .commissionRate(store.getCommissionRate())
                .usesDefaultCommissionRate(Boolean.TRUE.equals(store.getUsesDefaultCommissionRate()))
                .effectiveCommissionRate(resolveEffectiveCommissionRate(store))
                .status(store.getStatus().name())
                .approvalStatus(store.getApprovalStatus().name())
                .rejectionReason(store.getRejectionReason())
                .approvedAt(store.getApprovedAt())
                .approvedBy(store.getApprovedBy())
                .totalSales(performanceMetrics.totalSales())
                .totalOrders(performanceMetrics.totalOrders())
                .rating(store.getRating())
                .productCount(productCount)
                .liveProductCount(liveProductCount)
                .responseRate(responseRate)
                .createdAt(store.getCreatedAt())
                .updatedAt(store.getUpdatedAt())
                .build();
    }

    private static Boolean defaultIfNull(Boolean value, boolean fallback) {
        return value != null ? value : fallback;
    }

    private BigDecimal resolveEffectiveCommissionRate(Store store) {
        if (platformCommissionSettingsService != null) {
            return platformCommissionSettingsService.resolveEffectiveCommissionRate(store);
        }
        BigDecimal storeRate = store.getCommissionRate();
        if (storeRate == null || storeRate.compareTo(BigDecimal.ZERO) <= 0) {
            return PlatformCommissionSettingsService.DEFAULT_COMMISSION_RATE_PERCENT;
        }
        return storeRate;
    }

    private void validateCommissionRate(BigDecimal commissionRate) {
        if (commissionRate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Commission rate is required");
        }
        if (commissionRate.compareTo(BigDecimal.ZERO) <= 0 || commissionRate.compareTo(new BigDecimal("100")) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Commission rate must be greater than 0 and less than or equal to 100");
        }
    }

    private void writeAdminAuditLog(
            UUID actorId,
            String actorEmail,
            String domain,
            String action,
            UUID targetId,
            boolean success,
            String note
    ) {
        if (adminAuditLogService == null) return;
        adminAuditLogService.logAction(actorId, actorEmail, domain, action, targetId, success, note);
    }
}
