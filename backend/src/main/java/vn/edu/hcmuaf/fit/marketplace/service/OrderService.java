package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.event.SubOrderReadyForVendorEvent;
import vn.edu.hcmuaf.fit.marketplace.dto.request.OrderRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorTopProductResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorOrderDetailResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorOrderPageResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorOrderSummaryResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AdminOrderResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.OrderTreeResponseDto;
import vn.edu.hcmuaf.fit.marketplace.dto.response.ParentOrderSummaryDto;
import vn.edu.hcmuaf.fit.marketplace.dto.response.SubOrderSummaryDto;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorSubOrderPageResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.*;
import vn.edu.hcmuaf.fit.marketplace.exception.ForbiddenException;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;
import vn.edu.hcmuaf.fit.marketplace.repository.*;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;
    private final AddressRepository addressRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository productVariantRepository;
    private final FlashSaleItemRepository flashSaleItemRepository;
    private final WalletService walletService;
    private final StoreRepository storeRepository;
    private final CouponRepository couponRepository;
    private final VoucherRepository voucherRepository;
    private final CustomerVoucherRepository customerVoucherRepository;
    private final PublicCodeService publicCodeService;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final AdminAuditLogService adminAuditLogService;
    private final NotificationDomainService notificationDomainService;
    private final OrderStatusLogRepository orderStatusLogRepository;
    private final PlatformCommissionSettingsService platformCommissionSettingsService;

    @Autowired(required = false)
    private GhnService ghnService;

    public void setGhnService(GhnService ghnService) {
        this.ghnService = ghnService;
    }

    @Value("${app.orders.sla.vendor-confirmation.days:3}")
    private long vendorConfirmationSlaDays = VENDOR_CONFIRMATION_SLA_DAYS;

    @Autowired
    public OrderService(OrderRepository orderRepository, UserRepository userRepository,
            AddressRepository addressRepository, ProductRepository productRepository,
            ProductVariantRepository productVariantRepository, FlashSaleItemRepository flashSaleItemRepository,
            WalletService walletService,
            StoreRepository storeRepository, CouponRepository couponRepository,
            VoucherRepository voucherRepository, CustomerVoucherRepository customerVoucherRepository,
            PublicCodeService publicCodeService,
            ApplicationEventPublisher applicationEventPublisher,
            AdminAuditLogService adminAuditLogService,
            NotificationDomainService notificationDomainService,
            OrderStatusLogRepository orderStatusLogRepository,
            PlatformCommissionSettingsService platformCommissionSettingsService) {
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
        this.addressRepository = addressRepository;
        this.productRepository = productRepository;
        this.productVariantRepository = productVariantRepository;
        this.flashSaleItemRepository = flashSaleItemRepository;
        this.walletService = walletService;
        this.storeRepository = storeRepository;
        this.couponRepository = couponRepository;
        this.voucherRepository = voucherRepository;
        this.customerVoucherRepository = customerVoucherRepository;
        this.publicCodeService = publicCodeService;
        this.applicationEventPublisher = applicationEventPublisher;
        this.adminAuditLogService = adminAuditLogService;
        this.notificationDomainService = notificationDomainService;
        this.orderStatusLogRepository = orderStatusLogRepository;
        this.platformCommissionSettingsService = platformCommissionSettingsService;
    }

    public OrderService(OrderRepository orderRepository, UserRepository userRepository,
            AddressRepository addressRepository, ProductRepository productRepository,
            ProductVariantRepository productVariantRepository, FlashSaleItemRepository flashSaleItemRepository,
            WalletService walletService,
            StoreRepository storeRepository, CouponRepository couponRepository,
            VoucherRepository voucherRepository, CustomerVoucherRepository customerVoucherRepository,
            PublicCodeService publicCodeService,
            ApplicationEventPublisher applicationEventPublisher,
            AdminAuditLogService adminAuditLogService,
            NotificationDomainService notificationDomainService,
            OrderStatusLogRepository orderStatusLogRepository) {
        this(
                orderRepository,
                userRepository,
                addressRepository,
                productRepository,
                productVariantRepository,
                flashSaleItemRepository,
                walletService,
                storeRepository,
                couponRepository,
                voucherRepository,
                customerVoucherRepository,
                publicCodeService,
                applicationEventPublisher,
                adminAuditLogService,
                notificationDomainService,
                orderStatusLogRepository,
                null);
    }

    public OrderService(OrderRepository orderRepository, UserRepository userRepository,
            AddressRepository addressRepository, ProductRepository productRepository,
            ProductVariantRepository productVariantRepository, WalletService walletService,
            StoreRepository storeRepository, CouponRepository couponRepository,
            VoucherRepository voucherRepository, PublicCodeService publicCodeService,
            ApplicationEventPublisher applicationEventPublisher,
            AdminAuditLogService adminAuditLogService,
            NotificationDomainService notificationDomainService,
            OrderStatusLogRepository orderStatusLogRepository) {
        this(
                orderRepository,
                userRepository,
                addressRepository,
                productRepository,
                productVariantRepository,
                null,
                walletService,
                storeRepository,
                couponRepository,
                voucherRepository,
                null,
                publicCodeService,
                applicationEventPublisher,
                adminAuditLogService,
                notificationDomainService,
                orderStatusLogRepository,
                null);
    }

    public OrderService(OrderRepository orderRepository, UserRepository userRepository,
            AddressRepository addressRepository, ProductRepository productRepository,
            ProductVariantRepository productVariantRepository, WalletService walletService,
            StoreRepository storeRepository, CouponRepository couponRepository,
            VoucherRepository voucherRepository, PublicCodeService publicCodeService,
            ApplicationEventPublisher applicationEventPublisher) {
        this(
                orderRepository,
                userRepository,
                addressRepository,
                productRepository,
                productVariantRepository,
                null,
                walletService,
                storeRepository,
                couponRepository,
                voucherRepository,
                null,
                publicCodeService,
                applicationEventPublisher,
                null,
                null,
                null,
                null);
    }

    public OrderService(OrderRepository orderRepository, UserRepository userRepository,
            AddressRepository addressRepository, ProductRepository productRepository,
            ProductVariantRepository productVariantRepository, WalletService walletService,
            StoreRepository storeRepository, CouponRepository couponRepository,
            VoucherRepository voucherRepository, CustomerVoucherRepository customerVoucherRepository,
            PublicCodeService publicCodeService,
            ApplicationEventPublisher applicationEventPublisher) {
        this(
                orderRepository,
                userRepository,
                addressRepository,
                productRepository,
                productVariantRepository,
                null,
                walletService,
                storeRepository,
                couponRepository,
                voucherRepository,
                customerVoucherRepository,
                publicCodeService,
                applicationEventPublisher,
                null,
                null,
                null,
                null);
    }

    private static final BigDecimal DEFAULT_COMMISSION_RATE_PERCENT = PlatformCommissionSettingsService.DEFAULT_COMMISSION_RATE_PERCENT;
    private static final BigDecimal COMMISSION_RATE_DIVISOR = new BigDecimal("100");
    private static final BigDecimal DEFAULT_SHIPPING_FEE = new BigDecimal("30000.0");
    private static final BigDecimal FREE_SHIPPING_THRESHOLD = new BigDecimal("500000.0");
    private static final LocalDateTime DEFAULT_FILTER_FROM = LocalDateTime.of(1970, 1, 1, 0, 0);
    private static final LocalDateTime DEFAULT_FILTER_TO = LocalDateTime.of(2999, 12, 31, 23, 59, 59);
    private static final EnumSet<Order.OrderStatus> TRACKING_UPDATABLE_STATUSES = EnumSet
            .of(Order.OrderStatus.PROCESSING, Order.OrderStatus.SHIPPED);
    private static final EnumSet<Order.OrderStatus> RESTOCKABLE_CANCEL_SOURCE_STATUSES = EnumSet.of(
            Order.OrderStatus.PENDING,
            Order.OrderStatus.WAITING_FOR_VENDOR,
            Order.OrderStatus.CONFIRMED,
            Order.OrderStatus.PROCESSING);
    private static final EnumSet<Order.OrderStatus> CUSTOMER_NOTIFICATION_STATUSES = EnumSet.of(
            Order.OrderStatus.WAITING_FOR_VENDOR,
            Order.OrderStatus.CONFIRMED,
            Order.OrderStatus.PROCESSING,
            Order.OrderStatus.SHIPPED,
            Order.OrderStatus.DELIVERED,
            Order.OrderStatus.CANCELLED);
    private static final String ORDER_LOG_EVENT_CREATED = "ORDER_CREATED";
    private static final String ORDER_LOG_EVENT_STATUS_CHANGED = "STATUS_CHANGED";
    private static final String ORDER_LOG_EVENT_TRACKING_UPDATED = "TRACKING_UPDATED";
    private static final String ORDER_LOG_EVENT_SLA_AUTO_CANCELLED = "SLA_AUTO_CANCELLED";
    private static final long VENDOR_CONFIRMATION_SLA_DAYS = 3L;
    private static final int MAX_VENDOR_CONFIRMATION_AUTO_CANCEL_BATCH_SIZE = 500;
    private static final int VENDOR_CONFIRMATION_READ_RECONCILE_BATCH_SIZE = 100;
    private static final String OWN_STORE_PURCHASE_MESSAGE = "Khong the mua san pham tu gian hang cua chinh ban.";

    private record PreparedOrderItem(
            Product product,
            ProductVariant variant,
            Integer quantity,
            BigDecimal unitPrice,
            BigDecimal totalPrice,
            UUID storeId,
            String productName,
            String variantName,
            String productImage,
            UUID flashSaleItemId,
            BigDecimal flashSaleUnitPrice) {
    }

    private record CheckoutProductLine(
            OrderRequest.OrderItemRequest request,
            Product product) {
    }

    private record FlashSaleAllocation(
            UUID flashSaleItemId,
            BigDecimal flashUnitPrice) {
        static FlashSaleAllocation none() {
            return new FlashSaleAllocation(null, null);
        }

        boolean applied() {
            return flashSaleItemId != null && flashUnitPrice != null && flashUnitPrice.compareTo(BigDecimal.ZERO) > 0;
        }
    }

    private record StoreOrderGroup(
            UUID storeId,
            List<PreparedOrderItem> items,
            BigDecimal subtotal) {
    }

    private record DiscountApplication(
            String code,
            BigDecimal totalDiscount,
            Map<UUID, BigDecimal> storeDiscounts,
            UUID customerVoucherId,
            Coupon coupon,
            Voucher voucher) {
        static DiscountApplication none() {
            return new DiscountApplication(null, BigDecimal.ZERO, Map.of(), null, null, null);
        }

        BigDecimal discountForStore(UUID storeId) {
            if (storeId == null) {
                return BigDecimal.ZERO;
            }
            return storeDiscounts.getOrDefault(storeId, BigDecimal.ZERO);
        }
    }

    private record CommissionSnapshot(
            BigDecimal rateApplied,
            BigDecimal baseAmount,
            BigDecimal feeAmount) {
    }

    // ─── Customer Methods ──────────────────────────────────────────────────────

    @Transactional
    public List<AdminOrderResponse> findByUserId(UUID userId) {
        reconcileVendorConfirmationSlaForRead();
        return orderRepository.findByUserIdAndParentOrderIsNullOrderByCreatedAtDesc(userId)
                .stream()
                .map(this::toAdminOrderResponse)
                .toList();
    }

    public Order findById(UUID id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found"));
    }

    public Order findByCode(String code) {
        return orderRepository.findByOrderCode(normalizeRequiredText(code, "Order code is required"))
                .orElseThrow(() -> new ResourceNotFoundException("Order not found"));
    }

    /**
     * Find order by ID with user ownership validation
     */
    public Order findByIdForUser(UUID orderId, UUID userId) {
        Order order = findById(orderId);
        if (!order.getUser().getId().equals(userId)) {
            throw new ForbiddenException("You don't have access to this order");
        }
        return order;
    }

    public Order findByCodeForUser(String orderCode, UUID userId) {
        Order order = findByCode(orderCode);
        if (!order.getUser().getId().equals(userId)) {
            throw new ForbiddenException("You don't have access to this order");
        }
        return order;
    }

    @Transactional(readOnly = true)
    public AdminOrderResponse getAdminOrderById(UUID id) {
        return toAdminOrderResponse(findById(id));
    }

    @Transactional(readOnly = true)
    public AdminOrderResponse getAdminOrderByCode(String code) {
        return toAdminOrderResponse(findByCode(code));
    }

    @Transactional
    public AdminOrderResponse getCustomerOrderById(UUID orderId, UUID userId) {
        reconcileVendorConfirmationSlaForRead();
        return toAdminOrderResponse(findByIdForUser(orderId, userId));
    }

    @Transactional
    public AdminOrderResponse getCustomerOrderByCode(String orderCode, UUID userId) {
        reconcileVendorConfirmationSlaForRead();
        return toAdminOrderResponse(findByCodeForUser(orderCode, userId));
    }

    // ─── Vendor Methods (Multi-tenant) ─────────────────────────────────────────

    /**
     * Find all orders for a specific store (vendor's view)
     */
    public Page<Order> findByStoreId(UUID storeId, Pageable pageable) {
        return orderRepository.findByStoreIdOrderByCreatedAtDesc(storeId, pageable);
    }

    /**
     * Find orders by store with status filter
     */
    public Page<Order> findByStoreIdAndStatus(UUID storeId, Order.OrderStatus status, Pageable pageable) {
        return orderRepository.findByStoreIdAndStatusOrderByCreatedAtDesc(storeId, status, pageable);
    }

    public Page<Order> findByStoreIdFiltered(
            UUID storeId,
            Order.OrderStatus status,
            String keyword,
            LocalDateTime fromDate,
            LocalDateTime toDate,
            Pageable pageable) {
        String normalizedKeyword = normalizeKeyword(keyword);
        LocalDateTime effectiveFrom = fromDate != null ? fromDate : DEFAULT_FILTER_FROM;
        LocalDateTime effectiveTo = toDate != null ? toDate : DEFAULT_FILTER_TO;

        if (!effectiveTo.isAfter(effectiveFrom)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "date_to must be greater than date_from");
        }

        if (status == Order.OrderStatus.PENDING || status == Order.OrderStatus.WAITING_FOR_VENDOR) {
            return orderRepository.searchByStoreStatuses(
                    storeId,
                    List.of(Order.OrderStatus.WAITING_FOR_VENDOR),
                    normalizedKeyword,
                    effectiveFrom,
                    effectiveTo,
                    pageable);
        }
        if (status == null) {
            return orderRepository.searchByStoreStatuses(
                    storeId,
                    List.of(
                            Order.OrderStatus.WAITING_FOR_VENDOR,
                            Order.OrderStatus.CONFIRMED,
                            Order.OrderStatus.PROCESSING,
                            Order.OrderStatus.SHIPPED,
                            Order.OrderStatus.DELIVERED,
                            Order.OrderStatus.CANCELLED),
                    normalizedKeyword,
                    effectiveFrom,
                    effectiveTo,
                    pageable);
        }

        return orderRepository.searchByStore(storeId, status, normalizedKeyword, effectiveFrom, effectiveTo, pageable);
    }

    /**
     * Find order by ID with store ownership validation (for vendors)
     */
    public Order findByIdForStore(UUID orderId, UUID storeId) {
        return orderRepository.findByIdAndStoreId(orderId, storeId)
                .orElseThrow(() -> new ForbiddenException("Order not found or you don't have access to it"));
    }

    public Order findByCodeForStore(String orderCode, UUID storeId) {
        return orderRepository
                .findByOrderCodeAndStoreId(normalizeRequiredText(orderCode, "Order code is required"), storeId)
                .orElseThrow(() -> new ForbiddenException("Order not found or you don't have access to it"));
    }

    @Transactional
    public VendorOrderPageResponse getVendorOrderPage(
            UUID storeId,
            Order.OrderStatus status,
            String keyword,
            LocalDateTime fromDate,
            LocalDateTime toDate,
            Pageable pageable) {
        reconcileVendorConfirmationSlaForRead();
        Page<Order> page = findByStoreIdFiltered(storeId, status, keyword, fromDate, toDate, pageable);
        return VendorOrderPageResponse.builder()
                .content(page.getContent().stream().map(this::toVendorOrderSummaryResponse).toList())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .number(page.getNumber())
                .size(page.getSize())
                .statusCounts(buildVendorStatusCounts(storeId))
                .build();
    }

    @Transactional
    public VendorOrderDetailResponse getVendorOrderDetail(UUID orderId, UUID storeId) {
        reconcileVendorConfirmationSlaForRead();
        return toVendorOrderDetailResponse(findByIdForStore(orderId, storeId));
    }

    @Transactional
    public VendorOrderDetailResponse getVendorOrderDetailByCode(String orderCode, UUID storeId) {
        reconcileVendorConfirmationSlaForRead();
        return toVendorOrderDetailResponse(findByCodeForStore(orderCode, storeId));
    }

    @Transactional
    public VendorSubOrderPageResponse getVendorSubOrderPage(
            UUID storeId,
            Order.OrderStatus status,
            String keyword,
            LocalDateTime fromDate,
            LocalDateTime toDate,
            Pageable pageable) {
        reconcileVendorConfirmationSlaForRead();
        Page<Order> page = findByStoreIdFiltered(storeId, status, keyword, fromDate, toDate, pageable);
        Map<UUID, String> storeNames = buildStoreNameMap(page.getContent());

        return VendorSubOrderPageResponse.builder()
                .content(page.getContent().stream()
                        .map(order -> toSubOrderSummaryDto(order, storeNames))
                        .toList())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .number(page.getNumber())
                .size(page.getSize())
                .statusCounts(buildVendorSubOrderStatusCounts(storeId))
                .build();
    }

    @Transactional
    public AdminOrderResponse markOrderPaid(UUID orderId) {
        Order order = findById(orderId);
        order.setPaymentStatus(Order.PaymentStatus.PAID);
        if (order.getPaidAt() == null) {
            order.setPaidAt(LocalDateTime.now());
        }
        Order savedOrder = orderRepository.save(order);
        savedOrder = processOrderAfterCheckout(savedOrder);
        if (savedOrder.isSubOrder()) {
            savedOrder = syncParentOrderStatus(savedOrder.getParentOrder().getId());
        }
        if (savedOrder.isParentOrder()) {
            savedOrder = syncParentOrderStatus(savedOrder.getId());
        }
        consumeDiscountUsageIfEligible(savedOrder);
        notifyCustomerPaymentSuccess(savedOrder);
        return toAdminOrderResponse(savedOrder);
    }

    @Transactional
    public void cancelUnpaidOnlinePaymentOrder(UUID orderId, String reason) {
        Order order = findById(orderId);
        if (!isOnlinePaymentMethod(order.getPaymentMethod())) {
            return;
        }
        if (order.getPaymentStatus() == Order.PaymentStatus.PAID
                || order.getStatus() == Order.OrderStatus.CANCELLED
                || order.getStatus() == Order.OrderStatus.DELIVERED) {
            return;
        }

        applyStatusUpdate(order, Order.OrderStatus.CANCELLED, null, null, reason, false);
    }

    @Transactional
    public int autoCancelExpiredVendorConfirmations(LocalDateTime now, int batchSize) {
        LocalDateTime effectiveNow = now == null ? LocalDateTime.now() : now;
        LocalDateTime legacyCutoff = effectiveNow.minusDays(vendorConfirmationSlaDays());
        int limit = Math.max(1, Math.min(batchSize, MAX_VENDOR_CONFIRMATION_AUTO_CANCEL_BATCH_SIZE));

        List<Order> candidates = orderRepository.findVendorConfirmationDeadlineBreaches(
                effectiveNow,
                legacyCutoff,
                PageRequest.of(0, limit));

        int cancelled = 0;
        for (Order candidate : candidates) {
            if (candidate == null || candidate.getId() == null) {
                continue;
            }
            Order order = orderRepository.findByIdForUpdate(candidate.getId()).orElse(null);
            if (!isVendorConfirmationExpired(order, effectiveNow)) {
                continue;
            }

            LocalDateTime missedDeadline = resolveVendorConfirmationDeadline(order);
            Order.OrderStatus parentStatusBefore = resolveParentStatus(order);
            Order saved = applyStatusUpdate(
                    order,
                    Order.OrderStatus.CANCELLED,
                    null,
                    null,
                    vendorConfirmationSlaCancelReason(),
                    false);
            recordSlaAutoCancelled(saved, missedDeadline);
            notifyCustomerVendorSlaAutoCancelled(saved, parentStatusBefore);
            cancelled++;
        }

        return cancelled;
    }

    private void reconcileVendorConfirmationSlaForRead() {
        autoCancelExpiredVendorConfirmations(LocalDateTime.now(), VENDOR_CONFIRMATION_READ_RECONCILE_BATCH_SIZE);
    }

    /**
     * Get order count for a store
     */
    public long countByStoreId(UUID storeId) {
        return orderRepository.countByStoreId(storeId);
    }

    /**
     * Get order count by status for a store
     */
    public long countByStoreIdAndStatus(UUID storeId, Order.OrderStatus status) {
        return orderRepository.countByStoreIdAndStatus(storeId, status);
    }

    private VendorSubOrderPageResponse.StatusCounts buildVendorSubOrderStatusCounts(UUID storeId) {
        return VendorSubOrderPageResponse.StatusCounts.builder()
                .all(countByStoreId(storeId))
                .pending(countByStoreIdAndStatus(storeId, Order.OrderStatus.WAITING_FOR_VENDOR))
                .confirmed(countByStoreIdAndStatus(storeId, Order.OrderStatus.CONFIRMED))
                .processing(countByStoreIdAndStatus(storeId, Order.OrderStatus.PROCESSING))
                .shipped(countByStoreIdAndStatus(storeId, Order.OrderStatus.SHIPPED))
                .delivered(countByStoreIdAndStatus(storeId, Order.OrderStatus.DELIVERED))
                .cancelled(countByStoreIdAndStatus(storeId, Order.OrderStatus.CANCELLED))
                .build();
    }

    private VendorOrderPageResponse.StatusCounts buildVendorStatusCounts(UUID storeId) {
        return VendorOrderPageResponse.StatusCounts.builder()
                .all(countByStoreId(storeId))
                .pending(countByStoreIdAndStatus(storeId, Order.OrderStatus.WAITING_FOR_VENDOR))
                .confirmed(countByStoreIdAndStatus(storeId, Order.OrderStatus.CONFIRMED))
                .processing(countByStoreIdAndStatus(storeId, Order.OrderStatus.PROCESSING))
                .shipped(countByStoreIdAndStatus(storeId, Order.OrderStatus.SHIPPED))
                .delivered(countByStoreIdAndStatus(storeId, Order.OrderStatus.DELIVERED))
                .cancelled(countByStoreIdAndStatus(storeId, Order.OrderStatus.CANCELLED))
                .build();
    }

    /**
     * Calculate total revenue for a store
     */
    public BigDecimal calculateRevenueByStoreId(UUID storeId) {
        return orderRepository.calculateRevenueByStoreId(storeId);
    }

    /**
     * Calculate total payout for a store
     */
    public BigDecimal calculatePayoutByStoreId(UUID storeId) {
        return orderRepository.calculatePayoutByStoreId(storeId);
    }

    @Transactional(readOnly = true)
    public List<VendorTopProductResponse> getTopProductsByStore(UUID storeId, int days, int limit) {
        if (days != 1 && days != 7 && days != 30) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "days must be one of: 1, 7, 30");
        }

        if (limit < 1 || limit > 20) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 20");
        }

        LocalDateTime fromDate = LocalDate.now().minusDays(days - 1L).atStartOfDay();
        LocalDateTime toDate = LocalDate.now().plusDays(1).atStartOfDay();

        return orderRepository.findTopDeliveredProductsByStoreBetween(
                storeId,
                fromDate,
                toDate,
                PageRequest.of(0, limit)).stream()
                .map(row -> VendorTopProductResponse.builder()
                        .productId(row.getProductId())
                        .productName((row.getProductName() == null || row.getProductName().isBlank()) ? "Sản phẩm"
                                : row.getProductName())
                        .productImage(row.getProductImage() == null ? "" : row.getProductImage())
                        .soldCount(row.getSoldCount() == null ? 0L : row.getSoldCount())
                        .grossRevenue(row.getGrossRevenue() == null ? BigDecimal.ZERO : row.getGrossRevenue())
                        .build())
                .toList();
    }

    // ─── Admin Methods ─────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<AdminOrderResponse> findAllAdminOrders() {
        return orderRepository.findAll().stream()
                .map(this::toAdminOrderResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ParentOrderSummaryDto> getAdminParentOrderSummaries() {
        List<Order> rootOrders = orderRepository.findByParentOrderIsNullOrderByCreatedAtDesc();
        if (rootOrders.isEmpty()) {
            return List.of();
        }

        List<UUID> parentOrderIds = rootOrders.stream()
                .map(Order::getId)
                .toList();
        List<Order> subOrders = orderRepository.findByParentOrderIdInWithItemsOrderByCreatedAtDesc(parentOrderIds);
        Map<UUID, List<Order>> subOrdersByParent = groupSubOrdersByParent(subOrders);

        List<Order> ordersForStoreLookup = new ArrayList<>(rootOrders);
        ordersForStoreLookup.addAll(subOrders);
        Map<UUID, String> storeNames = buildStoreNameMap(ordersForStoreLookup);

        return rootOrders.stream()
                .map(rootOrder -> toParentOrderSummaryDto(rootOrder, subOrdersByParent, storeNames))
                .toList();
    }

    @Transactional
    public OrderTreeResponseDto getCustomerOrderTree(UUID orderId, UUID userId) {
        reconcileVendorConfirmationSlaForRead();
        return buildCustomerOrderTree(findByIdForUser(orderId, userId), userId);
    }

    @Transactional
    public OrderTreeResponseDto getCustomerOrderTreeByCode(String orderCode, UUID userId) {
        reconcileVendorConfirmationSlaForRead();
        return buildCustomerOrderTree(findByCodeForUser(orderCode, userId), userId);
    }

    private OrderTreeResponseDto buildCustomerOrderTree(Order selectedOrder, UUID userId) {
        Order rootOrder = selectedOrder.getParentOrder() != null
                ? findByIdForUser(selectedOrder.getParentOrder().getId(), userId)
                : selectedOrder;

        List<Order> dbSubOrders = orderRepository.findByParentOrderIdWithItemsOrderByCreatedAtDesc(rootOrder.getId());
        boolean syntheticSingleSubOrder = dbSubOrders.isEmpty() && rootOrder.getStoreId() != null;
        List<Order> normalizedSubOrders = syntheticSingleSubOrder ? List.of(rootOrder) : dbSubOrders;
        Map<UUID, String> storeNames = buildStoreNameMap(normalizedSubOrders);

        List<OrderTreeResponseDto.SubOrderNode> subOrderNodes = normalizedSubOrders.stream()
                .sorted(Comparator.comparing(Order::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                        .reversed())
                .map(order -> toOrderTreeSubOrderNode(order, storeNames))
                .toList();

        List<OrderTreeResponseDto.ItemNode> rootItems = normalizedSubOrders.isEmpty()
                ? toOrderTreeItemNodes(rootOrder.getItems())
                : List.of();

        return OrderTreeResponseDto.builder()
                .id(rootOrder.getId())
                .code(rootOrder.getOrderCode())
                .status(rootOrder.getStatus())
                .paymentMethod(rootOrder.getPaymentMethod())
                .paymentStatus(rootOrder.getPaymentStatus())
                .subtotal(rootOrder.getSubtotal())
                .shippingFee(rootOrder.getShippingFee())
                .discount(rootOrder.getDiscount())
                .totalAmount(rootOrder.getTotal())
                .splitOrder(!syntheticSingleSubOrder && !normalizedSubOrders.isEmpty())
                .createdAt(rootOrder.getCreatedAt())
                .updatedAt(rootOrder.getUpdatedAt())
                .deliveredAt(rootOrder.getDeliveredAt())
                .escrowDeadlineAt(rootOrder.getEscrowDeadlineAt())
                .vendorConfirmationDeadlineAt(resolveEarliestVendorConfirmationDeadline(rootOrder, normalizedSubOrders))
                .customer(toOrderTreeCustomer(rootOrder))
                .shippingAddress(toOrderTreeAddress(rootOrder))
                .subOrders(subOrderNodes)
                .items(rootItems)
                .timeline(buildCustomerTimeline(rootOrder, normalizedSubOrders))
                .build();
    }

    private AdminOrderResponse toAdminOrderResponse(Order order) {
        String storeName = order.getStoreId() != null
                ? storeRepository.findById(order.getStoreId()).map(Store::getName).orElse("Unknown Store")
                : "Platform";

        return AdminOrderResponse.builder()
                .id(order.getId())
                .code(order.getOrderCode())
                .storeName(storeName)
                .status(order.getStatus())
                .paymentMethod(order.getPaymentMethod())
                .paymentStatus(order.getPaymentStatus())
                .subtotal(order.getSubtotal())
                .shippingFee(order.getShippingFee())
                .discount(order.getDiscount())
                .total(order.getTotal())
                .commissionFee(order.getCommissionFee())
                .commissionRateApplied(order.getCommissionRateApplied())
                .commissionBaseAmount(order.getCommissionBaseAmount())
                .vendorPayout(order.getVendorPayout())
                .trackingNumber(order.getTrackingNumber())
                .carrier(order.getShippingCarrier())
                .note(order.getNote())
                .createdAt(order.getCreatedAt())
                .updatedAt(order.getUpdatedAt())
                .deliveredAt(order.getDeliveredAt())
                .escrowDeadlineAt(order.getEscrowDeadlineAt())
                .vendorConfirmationDeadlineAt(order.getVendorConfirmationDeadlineAt())
                .customer(order.getUser() != null ? AdminOrderResponse.CustomerInfo.builder()
                        .name(order.getUser().getName())
                        .email(order.getUser().getEmail())
                        .phone(order.getUser().getPhone())
                        .build() : null)
                .shippingAddress(order.getShippingAddress() != null ? AdminOrderResponse.AddressInfo.builder()
                        .fullName(order.getShippingAddress().getFullName())
                        .phone(order.getShippingAddress().getPhone())
                        .address(order.getShippingAddress().getDetail())
                        .ward(order.getShippingAddress().getWard())
                        .district(order.getShippingAddress().getDistrict())
                        .city(order.getShippingAddress().getProvince())
                        .build() : null)
                .items(order.getItems() == null ? List.of()
                        : order.getItems().stream().map(item -> AdminOrderResponse.ItemInfo.builder()
                                .id(item.getId())
                                .name(item.getProductName())
                                .sku(item.getVariant() != null && item.getVariant().getSku() != null
                                        ? item.getVariant().getSku()
                                        : (item.getId() != null ? item.getId().toString() : ""))
                                .variant(item.getVariantName())
                                .price(item.getUnitPrice())
                                .quantity(item.getQuantity())
                                .image(item.getProductImage())
                                .build()).toList())
                .build();
    }

    private ParentOrderSummaryDto toParentOrderSummaryDto(
            Order rootOrder,
            Map<UUID, List<Order>> subOrdersByParent,
            Map<UUID, String> storeNames) {
        List<Order> normalizedSubOrders = resolveSubOrdersForRoot(rootOrder, subOrdersByParent);
        List<SubOrderSummaryDto> subOrderDtos = normalizedSubOrders.stream()
                .sorted(Comparator.comparing(Order::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                        .reversed())
                .map(subOrder -> toSubOrderSummaryDto(subOrder, storeNames))
                .toList();

        int itemCount = subOrderDtos.stream()
                .map(SubOrderSummaryDto::getItemCount)
                .filter(value -> value != null)
                .mapToInt(Integer::intValue)
                .sum();

        return ParentOrderSummaryDto.builder()
                .id(rootOrder.getId())
                .code(rootOrder.getOrderCode())
                .status(rootOrder.getStatus())
                .paymentMethod(rootOrder.getPaymentMethod())
                .paymentStatus(rootOrder.getPaymentStatus())
                .subtotal(rootOrder.getSubtotal())
                .shippingFee(rootOrder.getShippingFee())
                .discount(rootOrder.getDiscount())
                .totalAmount(rootOrder.getTotal())
                .subOrderCount(subOrderDtos.size())
                .itemCount(itemCount)
                .createdAt(rootOrder.getCreatedAt())
                .updatedAt(rootOrder.getUpdatedAt())
                .vendorConfirmationDeadlineAt(resolveEarliestVendorConfirmationDeadline(rootOrder, normalizedSubOrders))
                .customer(ParentOrderSummaryDto.Customer.builder()
                        .name(rootOrder.getUser() != null ? rootOrder.getUser().getName() : null)
                        .email(rootOrder.getUser() != null ? rootOrder.getUser().getEmail() : null)
                        .phone(rootOrder.getUser() != null ? rootOrder.getUser().getPhone() : null)
                        .build())
                .shippingAddress(ParentOrderSummaryDto.Address.builder()
                        .fullName(rootOrder.getShippingAddress() != null ? rootOrder.getShippingAddress().getFullName()
                                : null)
                        .phone(rootOrder.getShippingAddress() != null ? rootOrder.getShippingAddress().getPhone()
                                : null)
                        .address(rootOrder.getShippingAddress() != null ? rootOrder.getShippingAddress().getDetail()
                                : null)
                        .ward(rootOrder.getShippingAddress() != null ? rootOrder.getShippingAddress().getWard() : null)
                        .district(rootOrder.getShippingAddress() != null ? rootOrder.getShippingAddress().getDistrict()
                                : null)
                        .city(rootOrder.getShippingAddress() != null ? rootOrder.getShippingAddress().getProvince()
                                : null)
                        .build())
                .subOrders(subOrderDtos)
                .build();
    }

    private List<Order> resolveSubOrdersForRoot(Order rootOrder, Map<UUID, List<Order>> subOrdersByParent) {
        List<Order> foundSubOrders = subOrdersByParent.getOrDefault(rootOrder.getId(), List.of());
        if (!foundSubOrders.isEmpty()) {
            return foundSubOrders;
        }
        if (rootOrder.getStoreId() != null) {
            return List.of(rootOrder);
        }
        return List.of();
    }

    private LocalDateTime resolveEarliestVendorConfirmationDeadline(Order rootOrder, List<Order> subOrders) {
        Stream<Order> candidates = subOrders == null || subOrders.isEmpty()
                ? Stream.of(rootOrder)
                : subOrders.stream();
        return candidates
                .filter(order -> order != null && order.getStatus() == Order.OrderStatus.WAITING_FOR_VENDOR)
                .map(Order::getVendorConfirmationDeadlineAt)
                .filter(deadline -> deadline != null)
                .min(LocalDateTime::compareTo)
                .orElse(rootOrder != null && rootOrder.getStatus() == Order.OrderStatus.WAITING_FOR_VENDOR
                        ? rootOrder.getVendorConfirmationDeadlineAt()
                        : null);
    }

    private Map<UUID, List<Order>> groupSubOrdersByParent(List<Order> subOrders) {
        Map<UUID, List<Order>> grouped = new HashMap<>();
        for (Order subOrder : subOrders) {
            if (subOrder.getParentOrder() == null || subOrder.getParentOrder().getId() == null) {
                continue;
            }
            grouped.computeIfAbsent(subOrder.getParentOrder().getId(), ignored -> new ArrayList<>()).add(subOrder);
        }
        return grouped;
    }

    private Map<UUID, String> buildStoreNameMap(List<Order> orders) {
        List<UUID> storeIds = orders.stream()
                .map(Order::getStoreId)
                .filter(value -> value != null)
                .distinct()
                .toList();
        if (storeIds.isEmpty()) {
            return Map.of();
        }

        Map<UUID, String> storeNames = new HashMap<>();
        for (Store store : storeRepository.findAllById(storeIds)) {
            storeNames.put(store.getId(), store.getName());
        }
        return storeNames;
    }

    private SubOrderSummaryDto toSubOrderSummaryDto(Order subOrder, Map<UUID, String> storeNames) {
        var items = subOrder.getItems();
        var firstItem = items != null && !items.isEmpty() ? items.get(0) : null;
        var primaryProductName = firstItem == null
                ? null
                : ((firstItem.getProductName() != null && !firstItem.getProductName().isBlank())
                        ? firstItem.getProductName()
                        : (firstItem.getProduct() != null ? firstItem.getProduct().getName() : null));
        var productMeta = firstItem != null && firstItem.getVariantName() != null
                && !firstItem.getVariantName().isBlank()
                        ? "Kich thuoc " + firstItem.getVariantName()
                        : null;
        var productExtra = items != null && items.size() > 1 ? "+" + (items.size() - 1) + " san pham khac" : null;

        return SubOrderSummaryDto.builder()
                .id(subOrder.getId())
                .code(subOrder.getOrderCode())
                .vendorId(subOrder.getStoreId())
                .vendorName(subOrder.getStoreId() == null ? null
                        : storeNames.getOrDefault(subOrder.getStoreId(), "Unknown Store"))
                .status(subOrder.getStatus())
                .subtotal(subOrder.getSubtotal())
                .shippingFee(subOrder.getShippingFee())
                .commissionAmount(subOrder.getCommissionFee())
                .total(subOrder.getTotal())
                .trackingNumber(subOrder.getTrackingNumber())
                .warehouseNote(subOrder.getWarehouseNote())
                .itemCount(items == null ? 0 : items.size())
                .productName(primaryProductName)
                .productMeta(productMeta)
                .productExtra(productExtra)
                .productImage(firstItem != null ? firstItem.getProductImage() : null)
                .createdAt(subOrder.getCreatedAt())
                .updatedAt(subOrder.getUpdatedAt())
                .vendorConfirmationDeadlineAt(subOrder.getVendorConfirmationDeadlineAt())
                .customer(SubOrderSummaryDto.Customer.builder()
                        .name(subOrder.getUser() != null ? subOrder.getUser().getName() : null)
                        .email(subOrder.getUser() != null ? subOrder.getUser().getEmail() : null)
                        .phone(subOrder.getUser() != null ? subOrder.getUser().getPhone() : null)
                        .build())
                .build();
    }

    private OrderTreeResponseDto.Customer toOrderTreeCustomer(Order order) {
        return OrderTreeResponseDto.Customer.builder()
                .name(order.getUser() != null ? order.getUser().getName() : null)
                .email(order.getUser() != null ? order.getUser().getEmail() : null)
                .phone(order.getUser() != null ? order.getUser().getPhone() : null)
                .build();
    }

    private OrderTreeResponseDto.Address toOrderTreeAddress(Order order) {
        return OrderTreeResponseDto.Address.builder()
                .fullName(order.getShippingAddress() != null ? order.getShippingAddress().getFullName() : null)
                .phone(order.getShippingAddress() != null ? order.getShippingAddress().getPhone() : null)
                .address(order.getShippingAddress() != null ? order.getShippingAddress().getDetail() : null)
                .ward(order.getShippingAddress() != null ? order.getShippingAddress().getWard() : null)
                .district(order.getShippingAddress() != null ? order.getShippingAddress().getDistrict() : null)
                .city(order.getShippingAddress() != null ? order.getShippingAddress().getProvince() : null)
                .build();
    }

    private OrderTreeResponseDto.SubOrderNode toOrderTreeSubOrderNode(Order subOrder, Map<UUID, String> storeNames) {
        return OrderTreeResponseDto.SubOrderNode.builder()
                .id(subOrder.getId())
                .code(subOrder.getOrderCode())
                .vendorId(subOrder.getStoreId())
                .vendorName(subOrder.getStoreId() == null ? null
                        : storeNames.getOrDefault(subOrder.getStoreId(), "Unknown Store"))
                .status(subOrder.getStatus())
                .subtotal(subOrder.getSubtotal())
                .shippingFee(subOrder.getShippingFee())
                .discount(subOrder.getDiscount())
                .totalAmount(subOrder.getTotal())
                .commissionAmount(subOrder.getCommissionFee())
                .trackingNumber(subOrder.getTrackingNumber())
                .warehouseNote(subOrder.getWarehouseNote())
                .createdAt(subOrder.getCreatedAt())
                .updatedAt(subOrder.getUpdatedAt())
                .deliveredAt(subOrder.getDeliveredAt())
                .escrowDeadlineAt(subOrder.getEscrowDeadlineAt())
                .vendorConfirmationDeadlineAt(subOrder.getVendorConfirmationDeadlineAt())
                .items(toOrderTreeItemNodes(subOrder.getItems()))
                .build();
    }

    private List<OrderTreeResponseDto.ItemNode> toOrderTreeItemNodes(List<OrderItem> items) {
        if (items == null || items.isEmpty()) {
            return List.of();
        }
        return items.stream()
                .map(item -> OrderTreeResponseDto.ItemNode.builder()
                        .id(item.getId())
                        .productId(item.getProduct() != null ? item.getProduct().getId() : null)
                        .productSlug(item.getProduct() != null ? item.getProduct().getSlug() : null)
                        .variantId(item.getVariant() != null ? item.getVariant().getId() : null)
                        .name(item.getProductName())
                        .sku(item.getVariant() != null ? item.getVariant().getSku() : null)
                        .variant(item.getVariantName())
                        .quantity(item.getQuantity())
                        .unitPrice(item.getUnitPrice())
                        .totalPrice(item.getTotalPrice())
                        .image(item.getProductImage())
                        .build())
                .toList();
    }

    // ─── Create Order ──────────────────────────────────────────────────────────

    private List<OrderTreeResponseDto.TimelineEntry> buildCustomerTimeline(Order rootOrder,
            List<Order> normalizedSubOrders) {
        if (rootOrder == null || rootOrder.getId() == null) {
            return List.of();
        }

        Map<UUID, Order> scopedOrders = new LinkedHashMap<>();
        scopedOrders.put(rootOrder.getId(), rootOrder);
        if (normalizedSubOrders != null) {
            for (Order subOrder : normalizedSubOrders) {
                if (subOrder != null && subOrder.getId() != null) {
                    scopedOrders.putIfAbsent(subOrder.getId(), subOrder);
                }
            }
        }

        List<Order> scopedOrderList = new ArrayList<>(scopedOrders.values());
        if (scopedOrderList.isEmpty()) {
            return List.of();
        }

        if (orderStatusLogRepository == null) {
            return buildFallbackTimeline(rootOrder, scopedOrderList);
        }

        List<OrderStatusLog> logs = orderStatusLogRepository
                .findByOrderIdInOrderByCreatedAtAsc(new ArrayList<>(scopedOrders.keySet()));
        if (logs.isEmpty()) {
            return buildFallbackTimeline(rootOrder, scopedOrderList);
        }

        Map<UUID, String> storeNames = buildStoreNameMap(scopedOrderList.stream()
                .filter(order -> order != null && order.getStoreId() != null)
                .toList());

        List<OrderTreeResponseDto.TimelineEntry> timeline = logs.stream()
                .sorted(Comparator.comparing(OrderStatusLog::getCreatedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(log -> toTimelineEntry(log, rootOrder, scopedOrders, storeNames))
                .filter(entry -> entry != null)
                .toList();

        return timeline.isEmpty() ? buildFallbackTimeline(rootOrder, scopedOrderList) : timeline;
    }

    private List<OrderTreeResponseDto.TimelineEntry> buildFallbackTimeline(Order rootOrder, List<Order> scopedOrders) {
        List<OrderTreeResponseDto.TimelineEntry> fallback = new ArrayList<>();
        fallback.add(OrderTreeResponseDto.TimelineEntry.builder()
                .at(rootOrder.getCreatedAt())
                .text("Đơn hàng đã được tạo.")
                .tone("success")
                .build());

        Map<UUID, String> storeNames = buildStoreNameMap(scopedOrders.stream()
                .filter(order -> order != null && order.getStoreId() != null)
                .toList());

        for (Order order : scopedOrders) {
            if (order == null || order.getId() == null || order.getStatus() == null) {
                continue;
            }
            if (rootOrder.getId().equals(order.getId())) {
                continue;
            }
            String vendorName = order.getStoreId() == null
                    ? "Người bán"
                    : storeNames.getOrDefault(order.getStoreId(), "Người bán");
            fallback.add(OrderTreeResponseDto.TimelineEntry.builder()
                    .at(order.getUpdatedAt() != null ? order.getUpdatedAt() : order.getCreatedAt())
                    .text(vendorName + " - " + orderStatusLabel(order.getStatus()))
                    .tone(order.getStatus() == Order.OrderStatus.CANCELLED ? "error" : "neutral")
                    .build());
        }

        return fallback.stream()
                .sorted(Comparator.comparing(OrderTreeResponseDto.TimelineEntry::getAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    private OrderTreeResponseDto.TimelineEntry toTimelineEntry(
            OrderStatusLog log,
            Order rootOrder,
            Map<UUID, Order> scopedOrders,
            Map<UUID, String> storeNames) {
        if (log == null) {
            return null;
        }

        UUID ownerOrderId = log.getOrder() != null ? log.getOrder().getId() : null;
        Order ownerOrder = ownerOrderId == null ? null : scopedOrders.get(ownerOrderId);
        boolean isRootOrderLog = ownerOrderId != null && rootOrder.getId().equals(ownerOrderId);

        String message = normalizeOptionalText(log.getMessage());
        if (message.isEmpty()) {
            message = orderStatusLabel(log.getStatusTo());
        }
        message = localizeTimelineMessage(message);

        if (!isRootOrderLog && ownerOrder != null && ownerOrder.getStoreId() != null) {
            String vendorName = storeNames.getOrDefault(ownerOrder.getStoreId(), "Người bán");
            message = vendorName + " - " + message;
        }

        return OrderTreeResponseDto.TimelineEntry.builder()
                .at(log.getCreatedAt() != null ? log.getCreatedAt() : log.getUpdatedAt())
                .text(message)
                .tone(normalizeTimelineTone(log.getTone()))
                .build();
    }

    private String normalizeTimelineTone(String tone) {
        String normalized = normalizeOptionalText(tone).toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "success", "pending", "error", "neutral", "info" -> normalized;
            default -> "neutral";
        };
    }

    private String orderStatusLabel(Order.OrderStatus status) {
        if (status == null) {
            return "Cập nhật đơn hàng";
        }
        return switch (status) {
            case PENDING -> "Đang chờ xử lý";
            case WAITING_FOR_VENDOR -> "Chờ người bán xác nhận";
            case CONFIRMED -> "Người bán đã xác nhận";
            case PROCESSING -> "Đơn hàng đang được chuẩn bị";
            case SHIPPED -> "Đơn hàng đang được giao";
            case DELIVERED -> "Đơn hàng đã giao thành công";
            case CANCELLED -> "Đơn hàng đã bị hủy";
            case RETURNING -> "Đơn hàng đang yêu cầu hoàn trả";
            case COMPLETED -> "Đơn hàng đã hoàn thành";
        };
    }

    private void recordOrderCreated(Order order) {
        if (order == null) {
            return;
        }
        recordOrderStatusLog(
                order,
                ORDER_LOG_EVENT_CREATED,
                "success",
                null,
                order.getStatus(),
                "Đơn hàng đã được tạo.");
    }

    private void recordStatusTransition(Order order, Order.OrderStatus fromStatus, Order.OrderStatus toStatus,
            String reason) {
        if (order == null || fromStatus == toStatus) {
            return;
        }
        String tone = switch (toStatus) {
            case DELIVERED -> "success";
            case CANCELLED -> "error";
            default -> "pending";
        };
        recordOrderStatusLog(
                order,
                ORDER_LOG_EVENT_STATUS_CHANGED,
                tone,
                fromStatus,
                toStatus,
                buildStatusTransitionMessage(order, toStatus, reason));
    }

    private void recordTrackingUpdated(Order order) {
        if (order == null) {
            return;
        }
        String tracking = normalizeOptionalText(order.getTrackingNumber());
        String carrier = normalizeOptionalText(order.getShippingCarrier());
        String message = "Đã cập nhật thông tin vận chuyển";
        if (!tracking.isEmpty()) {
            message += ": " + tracking;
            if (!carrier.isEmpty()) {
                message += " (" + carrier + ")";
            }
            message += ".";
        } else {
            message += ".";
        }
        recordOrderStatusLog(
                order,
                ORDER_LOG_EVENT_TRACKING_UPDATED,
                "info",
                order.getStatus(),
                order.getStatus(),
                message);
    }

    private String buildStatusTransitionMessage(Order order, Order.OrderStatus status, String reason) {
        String base = switch (status) {
            case PENDING -> "Đơn hàng mới được tạo.";
            case WAITING_FOR_VENDOR -> "Đơn hàng đã được tiếp nhận và chờ người bán xác nhận.";
            case CONFIRMED -> "Người bán đã xác nhận đơn hàng.";
            case PROCESSING -> "Đơn hàng đang được chuẩn bị.";
            case SHIPPED -> "Đơn hàng đã bàn giao cho đơn vị vận chuyển.";
            case DELIVERED -> "Đơn hàng đã giao thành công.";
            case CANCELLED -> "Đơn hàng đã bị hủy.";
            case RETURNING -> "Đơn hàng đang yêu cầu trả hàng.";
            case COMPLETED -> "Đơn hàng đã hoàn thành.";
        };

        if (status == Order.OrderStatus.SHIPPED && order != null) {
            String tracking = normalizeOptionalText(order.getTrackingNumber());
            String carrier = normalizeOptionalText(order.getShippingCarrier());
            if (!tracking.isEmpty()) {
                base += " Mã vận đơn: " + tracking + ".";
            }
            if (!carrier.isEmpty()) {
                base += " Đơn vị vận chuyển: " + carrier + ".";
            }
        }

        if (status == Order.OrderStatus.CANCELLED) {
            String normalizedReason = normalizeOptionalText(reason);
            if (!normalizedReason.isEmpty()) {
                base += " Lý do: " + normalizedReason + ".";
            }
        }
        return base;
    }

    private void recordOrderStatusLog(
            Order order,
            String eventType,
            String tone,
            Order.OrderStatus statusFrom,
            Order.OrderStatus statusTo,
            String message) {
        if (orderStatusLogRepository == null || order == null || order.getId() == null) {
            return;
        }
        String normalizedMessage = normalizeOptionalText(message);
        if (normalizedMessage.isEmpty()) {
            normalizedMessage = "Cập nhật đơn hàng.";
        } else {
            normalizedMessage = localizeTimelineMessage(normalizedMessage);
        }
        orderStatusLogRepository.save(OrderStatusLog.builder()
                .order(order)
                .eventType(eventType)
                .tone(normalizeTimelineTone(tone))
                .statusFrom(statusFrom)
                .statusTo(statusTo)
                .trackingNumber(normalizeOptionalText(order.getTrackingNumber()))
                .carrier(normalizeOptionalText(order.getShippingCarrier()))
                .message(normalizedMessage)
                .build());
    }

    private void assignVendorConfirmationDeadline(Order order, LocalDateTime baseTime) {
        if (order == null) {
            return;
        }
        LocalDateTime start = baseTime == null ? LocalDateTime.now() : baseTime;
        order.setVendorConfirmationDeadlineAt(start.plusDays(vendorConfirmationSlaDays()));
    }

    private long vendorConfirmationSlaDays() {
        return Math.max(1L, vendorConfirmationSlaDays);
    }

    private String vendorConfirmationSlaCancelReason() {
        return "Shop không xác nhận trong " + vendorConfirmationSlaDays() + " ngày";
    }

    private void refreshVendorConfirmationDeadline(Order order, Order.OrderStatus status) {
        if (order == null) {
            return;
        }
        if (status == Order.OrderStatus.WAITING_FOR_VENDOR) {
            if (order.getVendorConfirmationDeadlineAt() == null) {
                assignVendorConfirmationDeadline(order, LocalDateTime.now());
            }
            return;
        }
        order.setVendorConfirmationDeadlineAt(null);
    }

    private LocalDateTime resolveVendorConfirmationDeadline(Order order) {
        if (order == null) {
            return null;
        }
        if (order.getVendorConfirmationDeadlineAt() != null) {
            return order.getVendorConfirmationDeadlineAt();
        }
        return order.getCreatedAt() == null
                ? null
                : order.getCreatedAt().plusDays(vendorConfirmationSlaDays());
    }

    private boolean isVendorConfirmationExpired(Order order, LocalDateTime now) {
        if (!isVendorConfirmationSlaManagedOrder(order) || order.getStatus() != Order.OrderStatus.WAITING_FOR_VENDOR) {
            return false;
        }
        LocalDateTime deadline = resolveVendorConfirmationDeadline(order);
        return deadline != null && !deadline.isAfter(now);
    }

    private boolean isVendorConfirmationSlaManagedOrder(Order order) {
        if (order == null) {
            return false;
        }
        if (order.getStoreId() != null) {
            return true;
        }
        if (order.getParentOrder() != null) {
            return false;
        }
        List<Order> subOrders = order.getSubOrders();
        return subOrders == null || subOrders.isEmpty();
    }

    private void recordSlaAutoCancelled(Order order, LocalDateTime missedDeadline) {
        String message = "Đơn tự hủy do shop không xác nhận trong " + vendorConfirmationSlaDays() + " ngày.";
        if (missedDeadline != null) {
            message += " Hạn xác nhận: " + missedDeadline + ".";
        }
        recordOrderStatusLog(
                order,
                ORDER_LOG_EVENT_SLA_AUTO_CANCELLED,
                "error",
                Order.OrderStatus.WAITING_FOR_VENDOR,
                Order.OrderStatus.CANCELLED,
                message);
    }

    private Order.OrderStatus resolveParentStatus(Order order) {
        if (order == null || order.getParentOrder() == null) {
            return null;
        }
        return order.getParentOrder().getStatus();
    }

    private void notifyCustomerVendorSlaAutoCancelled(Order order, Order.OrderStatus parentStatusBefore) {
        if (notificationDomainService == null || order == null || !order.isSubOrder()) {
            return;
        }
        Order parent = order.getParentOrder();
        if (parent == null || parent.getUser() == null) {
            return;
        }
        Order.OrderStatus parentStatusAfter = parent.getStatus();
        String code = resolveOrderDisplayCode(parent);
        String title = "Đơn #" + code + " có kiện hàng tự hủy";
        String message = parentStatusBefore != null && parentStatusBefore != parentStatusAfter
                ? "Đơn tự hủy do shop không xử lý quá " + vendorConfirmationSlaDays() + " ngày."
                : "Một kiện hàng trong đơn tự hủy do shop không xử lý quá " + vendorConfirmationSlaDays() + " ngày.";
        notificationDomainService.createAndPush(
                parent.getUser().getId(),
                Notification.NotificationType.ORDER,
                title,
                message,
                buildOrderDetailLink(parent));
    }

    private String localizeTimelineMessage(String message) {
        String localized = normalizeOptionalText(message);
        if (localized.isEmpty()) {
            return "";
        }
        return localized
                .replace("Don hang da duoc tao.", "Đơn hàng đã được tạo.")
                .replace("Don hang moi duoc tao.", "Đơn hàng mới được tạo.")
                .replace("Don hang da duoc tiep nhan va cho nguoi ban xac nhan.",
                        "Đơn hàng đã được tiếp nhận và chờ người bán xác nhận.")
                .replace("Nguoi ban da xac nhan don hang.", "Người bán đã xác nhận đơn hàng.")
                .replace("Don hang dang duoc chuan bi.", "Đơn hàng đang được chuẩn bị.")
                .replace("Don hang da ban giao cho don vi van chuyen.", "Đơn hàng đã bàn giao cho đơn vị vận chuyển.")
                .replace("Don hang da giao thanh cong.", "Đơn hàng đã giao thành công.")
                .replace("Don hang da bi huy.", "Đơn hàng đã bị hủy.")
                .replace("Da cap nhat thong tin van chuyen", "Đã cập nhật thông tin vận chuyển")
                .replace("Cap nhat don hang.", "Cập nhật đơn hàng.")
                .replace("Cap nhat don hang", "Cập nhật đơn hàng")
                .replace("Dang cho xu ly", "Đang chờ xử lý")
                .replace("Cho nguoi ban xac nhan", "Chờ người bán xác nhận")
                .replace("Nguoi ban da xac nhan", "Người bán đã xác nhận")
                .replace("Don hang dang duoc chuan bi", "Đơn hàng đang được chuẩn bị")
                .replace("Don hang dang duoc giao", "Đơn hàng đang được giao")
                .replace("Don hang da giao thanh cong", "Đơn hàng đã giao thành công")
                .replace("Don hang da bi huy", "Đơn hàng đã bị hủy")
                .replace("Ma van don", "Mã vận đơn")
                .replace("Don vi van chuyen", "Đơn vị vận chuyển")
                .replace("Ly do", "Lý do");
    }

    @Transactional
    public AdminOrderResponse create(UUID userId, OrderRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order request is required");
        }
        if (request.getAddressId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Address is required");
        }
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order must contain at least one item");
        }
        if (request.getPaymentMethod() == null || request.getPaymentMethod().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment method is required");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Address address = addressRepository.findById(request.getAddressId())
                .orElseThrow(() -> new ResourceNotFoundException("Address not found"));

        if (!address.getUser().getId().equals(userId)) {
            throw new ForbiddenException("You don't have access to this address");
        }

        Order.PaymentMethod paymentMethod;
        try {
            paymentMethod = Order.PaymentMethod.valueOf(request.getPaymentMethod().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unsupported payment method: " + request.getPaymentMethod());
        }
        List<PreparedOrderItem> preparedItems = prepareOrderItems(request.getItems(), user.getStoreId());
        Map<UUID, StoreOrderGroup> groupedByStore = groupItemsByStore(preparedItems);
        if (request.getCustomerVoucherId() != null
                && request.getCouponCode() != null
                && !request.getCouponCode().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Please apply either customerVoucherId or couponCode, not both");
        }
        DiscountApplication discountApplication = resolveDiscountApplication(
                userId,
                request.getCustomerVoucherId(),
                request.getCouponCode(),
                groupedByStore);

        if (groupedByStore.size() <= 1) {
            StoreOrderGroup onlyGroup = groupedByStore.values().stream().findFirst()
                    .orElseThrow(
                            () -> new ResourceNotFoundException("Order must contain at least one valid store item"));

            Order created = createStoreScopedOrder(
                    user,
                    address,
                    request,
                    paymentMethod,
                    onlyGroup,
                    null,
                    discountApplication,
                    discountApplication.discountForStore(onlyGroup.storeId()));
            created = processOrderAfterCheckout(created);
            consumeDiscountUsageIfEligible(created);
            notifyCustomerOrderCreated(created);
            return toAdminOrderResponse(created);
        }

        Order parent = createParentOrderWithSubOrders(
                user,
                address,
                request,
                paymentMethod,
                preparedItems,
                groupedByStore,
                discountApplication);
        parent = processOrderAfterCheckout(parent);
        consumeDiscountUsageIfEligible(parent);
        notifyCustomerOrderCreated(parent);
        return toAdminOrderResponse(parent);
    }

    // ─── Cancel Order ──────────────────────────────────────────────────────────

    @Transactional
    public AdminOrderResponse cancel(UUID orderId, UUID userId, String reason) {
        Order order = findByIdForUser(orderId, userId);

        if (order.getStatus() != Order.OrderStatus.PENDING
                && order.getStatus() != Order.OrderStatus.WAITING_FOR_VENDOR) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Can only cancel orders waiting for vendor confirmation");
        }

        Order savedOrder = applyStatusUpdate(order, Order.OrderStatus.CANCELLED, null, null, reason, false);
        return toAdminOrderResponse(savedOrder);
    }

    // ─── Tracking ──────────────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public AdminOrderResponse getTrackingInfo(UUID orderId, UUID userId) {
        Order order = findByIdForUser(orderId, userId);
        return toAdminOrderResponse(order);
    }

    // ─── Update Status ─────────────────────────────────────────────────────────

    /**
     * Update order status (admin only - no ownership check)
     */
    @Transactional
    public Order updateStatus(UUID orderId, Order.OrderStatus status) {
        return updateStatus(orderId, status, null, null);
    }

    @Transactional
    public Order updateStatus(UUID orderId, Order.OrderStatus status, UUID adminId, String adminEmail) {
        try {
            Order order = findById(orderId);
            Order.OrderStatus previousStatus = order.getStatus();
            Order saved = applyStatusUpdate(order, status, null, null, null, false);
            if (adminId != null) {
                writeAdminAuditLog(
                        adminId,
                        adminEmail,
                        "ORDER",
                        "ADMIN_UPDATE_STATUS",
                        saved.getId(),
                        true,
                        "Status " + safeEnumName(previousStatus) + " -> " + safeEnumName(status));
            }
            return saved;
        } catch (RuntimeException ex) {
            if (adminId != null) {
                writeAdminAuditLog(
                        adminId,
                        adminEmail,
                        "ORDER",
                        "ADMIN_UPDATE_STATUS",
                        orderId,
                        false,
                        ex.getMessage());
            }
            throw ex;
        }
    }

    /**
     * Update order status with store ownership validation (vendor operation)
     */
    @Transactional
    public Order updateStatusForStore(
            UUID orderId,
            UUID storeId,
            Order.OrderStatus status,
            String trackingNumber,
            String carrier,
            String reason) {
        Order order = findByIdForStore(orderId, storeId);
        return applyStatusUpdate(order, status, trackingNumber, carrier, reason, true);
    }

    @Transactional
    public VendorOrderDetailResponse updateVendorOrderStatus(
            UUID orderId,
            UUID storeId,
            Order.OrderStatus status,
            String trackingNumber,
            String carrier,
            String reason) {
        Order updated = updateStatusForStore(orderId, storeId, status, trackingNumber, carrier, reason);
        return toVendorOrderDetailResponse(updated);
    }

    private Order applyStatusUpdate(
            Order order,
            Order.OrderStatus status,
            String trackingNumber,
            String carrier,
            String reason,
            boolean enforceVendorRules) {
        Order.OrderStatus previousStatus = order.getStatus();
        String previousTrackingNumber = normalizeOptionalText(order.getTrackingNumber());
        String previousCarrier = normalizeOptionalText(order.getShippingCarrier());
        validateStatusTransition(previousStatus, status, enforceVendorRules);

        if (status == Order.OrderStatus.SHIPPED) {
            String normalizedTracking = "ADMIN_FORCE_SHIPPED";
            String normalizedCarrier = "SYSTEM_SYNC";

            if (enforceVendorRules) {
                normalizedTracking = resolveRequiredField(
                        trackingNumber,
                        order.getTrackingNumber(),
                        "Tracking number is required before shipping");
                normalizedCarrier = resolveRequiredField(
                        carrier,
                        order.getShippingCarrier(),
                        "Carrier is required before shipping");
            } else if (trackingNumber != null && !trackingNumber.isBlank()) {
                normalizedTracking = trackingNumber.trim();
                normalizedCarrier = carrier != null && !carrier.isBlank() ? carrier.trim() : "ADMIN_SYNC";
            }
            order.setTrackingNumber(normalizedTracking);
            order.setShippingCarrier(normalizedCarrier);
        }

        if (status == Order.OrderStatus.CANCELLED) {
            String normalizedReason = normalizeOptionalText(reason);
            if (enforceVendorRules && normalizedReason.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancellation reason is required");
            }
            if (!normalizedReason.isEmpty()) {
                String currentNote = order.getNote() == null ? "" : order.getNote().trim();
                String cancelNote = "Cancellation reason: " + normalizedReason;
                order.setNote(currentNote.isEmpty() ? cancelNote : currentNote + "\n" + cancelNote);
            }
        }

        order.setStatus(status);
        refreshVendorConfirmationDeadline(order, status);
        if (status == Order.OrderStatus.CANCELLED) {
            restoreReservedStockOnCancellation(order, previousStatus);
            if (shouldMarkRefundPendingOnCancellation(order)) {
                order.setPaymentStatus(Order.PaymentStatus.REFUND_PENDING);
            }
        }

        if (status == Order.OrderStatus.DELIVERED) {
            if (enforceVendorRules) {
                ensureTrackingDataReady(order);
            }
            if (order.getDeliveredAt() == null) {
                order.setDeliveredAt(LocalDateTime.now());
            }
            order.setPaidAt(LocalDateTime.now());
            order.setPaymentStatus(Order.PaymentStatus.PAID);
            if (order.getEscrowDeadlineAt() == null) {
                order.setEscrowDeadlineAt(LocalDateTime.now().plusDays(7));
            }
        } else if (status != Order.OrderStatus.DELIVERED) {
            order.setDeliveredAt(null);
        }

        Order savedOrder = orderRepository.save(order);
        recordStatusTransition(savedOrder, previousStatus, savedOrder.getStatus(), reason);
        String currentTrackingNumber = normalizeOptionalText(savedOrder.getTrackingNumber());
        String currentCarrier = normalizeOptionalText(savedOrder.getShippingCarrier());
        if (!previousTrackingNumber.equals(currentTrackingNumber) || !previousCarrier.equals(currentCarrier)) {
            recordTrackingUpdated(savedOrder);
        }

        boolean hasSubOrders = false;
        if (savedOrder.isParentOrder()) {
            hasSubOrders = cascadeStatusToSubOrders(savedOrder, status, trackingNumber, carrier, reason);
        }

        if (savedOrder.getPaymentStatus() == Order.PaymentStatus.PAID) {
            consumeDiscountUsageIfEligible(savedOrder);
        }

        if (status == Order.OrderStatus.DELIVERED && savedOrder.getStoreId() != null) {
            walletService.creditEscrowForCompletedOrder(savedOrder);
        }

        if (previousStatus == Order.OrderStatus.DELIVERED
                && status == Order.OrderStatus.CANCELLED
                && savedOrder.getStoreId() != null) {
            walletService.debitVendorForRefund(savedOrder);
        }

        if (savedOrder.isSubOrder()) {
            syncParentOrderStatus(savedOrder.getParentOrder().getId());
        }

        if (savedOrder.isParentOrder() && hasSubOrders) {
            Order syncedParent = syncParentOrderStatus(savedOrder.getId());
            notifyCustomerOrderStatusChanged(syncedParent, previousStatus, syncedParent.getStatus());
            return syncedParent;
        }

        if (savedOrder.getParentOrder() == null) {
            notifyCustomerOrderStatusChanged(savedOrder, previousStatus, savedOrder.getStatus());
        }

        return savedOrder;
    }

    private boolean cascadeStatusToSubOrders(Order parentOrder, Order.OrderStatus status, String trackingNumber,
            String carrier, String reason) {
        List<Order> subOrders = orderRepository.findByParentOrderOrderByCreatedAtDesc(parentOrder);
        if (subOrders == null || subOrders.isEmpty()) {
            return false;
        }
        for (Order subOrder : subOrders) {
            if (subOrder.getStatus() == status)
                continue;

            String subTracking = trackingNumber == null ? "ADMIN_FORCE_" + status.name() : trackingNumber;
            String subCarrier = carrier == null ? "SYSTEM_SYNC" : carrier;

            // Recurse without enforcing vendor rules (since Admin forced it)
            applyStatusUpdate(subOrder, status, subTracking, subCarrier, reason, false);
        }
        return true;
    }

    private void restoreReservedStockOnCancellation(Order order, Order.OrderStatus previousStatus) {
        if (order == null || (order.getStoreId() == null && !isVendorConfirmationSlaManagedOrder(order))) {
            return;
        }
        if (!RESTOCKABLE_CANCEL_SOURCE_STATUSES.contains(previousStatus)) {
            return;
        }

        List<OrderItem> items = order.getItems() == null ? List.of() : order.getItems();
        for (OrderItem item : items) {
            restoreStockForOrderItem(item);
        }
    }

    private void restoreStockForOrderItem(OrderItem item) {
        if (item == null) {
            return;
        }
        int quantity = Math.max(0, item.getQuantity() == null ? 0 : item.getQuantity());
        if (quantity <= 0) {
            return;
        }
        restoreFlashSaleQuotaForOrderItem(item, quantity);

        ProductVariant itemVariant = item.getVariant();
        if (itemVariant != null && itemVariant.getId() != null) {
            ProductVariant lockedVariant = productVariantRepository.findByIdForUpdate(itemVariant.getId()).orElse(null);
            if (lockedVariant != null) {
                lockedVariant.setStockQuantity(safeInt(lockedVariant.getStockQuantity()) + quantity);
                Product variantProduct = lockedVariant.getProduct();
                if (variantProduct != null && variantProduct.getId() != null) {
                    Product lockedProduct = productRepository.findByIdForUpdate(variantProduct.getId()).orElse(null);
                    if (lockedProduct != null) {
                        Long activeVariantStock = productVariantRepository
                                .sumActiveStockByProductId(lockedProduct.getId());
                        int productStock = activeVariantStock == null ? 0 : Math.max(0, activeVariantStock.intValue());
                        lockedProduct.setStockQuantity(productStock);
                    }
                }
                return;
            }
        }

        Product itemProduct = item.getProduct();
        if (itemProduct == null || itemProduct.getId() == null) {
            return;
        }
        Product lockedProduct = productRepository.findByIdForUpdate(itemProduct.getId()).orElse(null);
        if (lockedProduct == null) {
            return;
        }
        lockedProduct.setStockQuantity(safeInt(lockedProduct.getStockQuantity()) + quantity);
    }

    private void restoreFlashSaleQuotaForOrderItem(OrderItem item, int quantity) {
        if (flashSaleItemRepository == null || item == null || item.getFlashSaleItemId() == null || quantity <= 0) {
            return;
        }
        FlashSaleItem lockedFlashItem = flashSaleItemRepository.findByIdForUpdate(item.getFlashSaleItemId())
                .orElse(null);
        if (lockedFlashItem == null) {
            return;
        }
        int soldCount = safeInt(lockedFlashItem.getSoldCount());
        lockedFlashItem.setSoldCount(Math.max(0, soldCount - quantity));
        flashSaleItemRepository.save(lockedFlashItem);
    }

    private void validateStatusTransition(Order.OrderStatus current, Order.OrderStatus next,
            boolean enforceVendorRules) {
        if (current == next) {
            return;
        }
        if (!enforceVendorRules) {
            return; // Admins can bypass strict state sequence
        }

        boolean allowed = switch (current) {
            case PENDING -> next == Order.OrderStatus.WAITING_FOR_VENDOR || next == Order.OrderStatus.CANCELLED;
            case WAITING_FOR_VENDOR -> next == Order.OrderStatus.CONFIRMED || next == Order.OrderStatus.CANCELLED;
            case CONFIRMED -> next == Order.OrderStatus.PROCESSING || next == Order.OrderStatus.CANCELLED;
            case PROCESSING -> next == Order.OrderStatus.SHIPPED || next == Order.OrderStatus.CANCELLED;
            case SHIPPED -> next == Order.OrderStatus.DELIVERED;
            case DELIVERED -> next == Order.OrderStatus.RETURNING || next == Order.OrderStatus.COMPLETED;
            case RETURNING -> next == Order.OrderStatus.DELIVERED || next == Order.OrderStatus.CANCELLED;
            case COMPLETED -> false;
            case CANCELLED -> false;
        };

        if (!allowed) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    String.format("Invalid status transition: %s -> %s", current, next));
        }
    }

    private String normalizeRequiredText(String value, String message) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return normalized;
    }

    private String normalizeOptionalText(String value) {
        return value == null ? "" : value.trim();
    }

    private String resolveRequiredField(String providedValue, String fallbackValue, String message) {
        String normalizedProvided = normalizeOptionalText(providedValue);
        if (!normalizedProvided.isEmpty()) {
            return normalizedProvided;
        }
        return normalizeRequiredText(fallbackValue, message);
    }

    private void ensureTrackingDataReady(Order order) {
        normalizeRequiredText(order.getTrackingNumber(), "Tracking number is required before marking as delivered");
        normalizeRequiredText(order.getShippingCarrier(), "Carrier is required before marking as delivered");
    }

    private String normalizeKeyword(String keyword) {
        if (keyword == null) {
            return null;
        }

        String normalized = keyword.trim().toLowerCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }

    // ─── Update Tracking ───────────────────────────────────────────────────────

    /**
     * Update tracking number with store ownership validation (vendor operation)
     */
    @Transactional
    public Order updateTrackingForStore(UUID orderId, UUID storeId, String trackingNumber) {
        Order order = findByIdForStore(orderId, storeId);
        if (!TRACKING_UPDATABLE_STATUSES.contains(order.getStatus())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Tracking can only be updated when order is PROCESSING or SHIPPED");
        }
        String previousTracking = normalizeOptionalText(order.getTrackingNumber());
        order.setTrackingNumber(normalizeRequiredText(trackingNumber, "Tracking number is required"));
        Order saved = orderRepository.save(order);
        if (!previousTracking.equals(normalizeOptionalText(saved.getTrackingNumber()))) {
            recordTrackingUpdated(saved);
        }
        return saved;
    }

    @Transactional
    public AdminOrderResponse updateAdminOrderTracking(UUID orderId, String trackingNumber) {
        Order order = findById(orderId);
        if (order.isParentOrder()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Cannot update tracking for parent marketplace order");
        }
        if (order.getStatus() == Order.OrderStatus.CANCELLED) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Cannot update tracking for cancelled order");
        }

        String previousTracking = normalizeOptionalText(order.getTrackingNumber());
        order.setTrackingNumber(normalizeRequiredText(trackingNumber, "Tracking number is required"));
        Order saved = orderRepository.save(order);
        if (!previousTracking.equals(normalizeOptionalText(saved.getTrackingNumber()))) {
            recordTrackingUpdated(saved);
        }
        if (saved.isSubOrder()) {
            syncParentOrderStatus(saved.getParentOrder().getId());
        }
        return toAdminOrderResponse(saved);
    }

    @Transactional
    public VendorOrderDetailResponse updateVendorOrderTracking(UUID orderId, UUID storeId, String trackingNumber) {
        return toVendorOrderDetailResponse(updateTrackingForStore(orderId, storeId, trackingNumber));
    }

    private VendorOrderSummaryResponse toVendorOrderSummaryResponse(Order order) {
        var items = order.getItems();
        var firstItem = items != null && !items.isEmpty() ? items.get(0) : null;
        var productMeta = firstItem != null
                ? Stream.of(
                        firstItem.getVariantName() != null ? "Kích thước " + firstItem.getVariantName() : null,
                        firstItem.getProductName() != null ? null
                                : (firstItem.getProduct() != null ? firstItem.getProduct().getName() : null))
                        .filter(s -> s != null && !s.isBlank())
                        .collect(Collectors.joining(" • "))
                : null;
        var productExtra = items != null && items.size() > 1 ? "+" + (items.size() - 1) + " sản phẩm khác" : null;

        return VendorOrderSummaryResponse.builder()
                .id(order.getId())
                .code(order.getOrderCode())
                .status(safeEnumName(order.getStatus()))
                .createdAt(order.getCreatedAt())
                .updatedAt(order.getUpdatedAt())
                .vendorConfirmationDeadlineAt(order.getVendorConfirmationDeadlineAt())
                .total(order.getTotal())
                .commissionFee(order.getCommissionFee())
                .vendorPayout(order.getVendorPayout())
                .itemCount(items == null ? 0 : items.size())
                .customer(VendorOrderSummaryResponse.Customer.builder()
                        .name(order.getUser() != null ? order.getUser().getName() : null)
                        .email(order.getUser() != null ? order.getUser().getEmail() : null)
                        .phone(order.getUser() != null ? order.getUser().getPhone() : null)
                        .build())
                .trackingNumber(order.getTrackingNumber())
                .shippingCarrier(order.getShippingCarrier())
                .warehouseNote(order.getWarehouseNote())
                .productName(firstItem != null ? firstItem.getProductName() : null)
                .productMeta(productMeta)
                .productExtra(productExtra)
                .productImage(firstItem != null ? firstItem.getProductImage() : null)
                .build();
    }

    private VendorOrderDetailResponse toVendorOrderDetailResponse(Order order) {
        return VendorOrderDetailResponse.builder()
                .id(order.getId())
                .code(order.getOrderCode())
                .status(safeEnumName(order.getStatus()))
                .createdAt(order.getCreatedAt())
                .updatedAt(order.getUpdatedAt())
                .vendorConfirmationDeadlineAt(order.getVendorConfirmationDeadlineAt())
                .subtotal(order.getSubtotal())
                .shippingFee(order.getShippingFee())
                .discount(order.getDiscount())
                .total(order.getTotal())
                .paymentMethod(safeEnumName(order.getPaymentMethod()))
                .paymentStatus(safeEnumName(order.getPaymentStatus()))
                .note(order.getNote())
                .warehouseNote(order.getWarehouseNote())
                .trackingNumber(order.getTrackingNumber())
                .shippingCarrier(order.getShippingCarrier())
                .commissionFee(order.getCommissionFee())
                .commissionRateApplied(order.getCommissionRateApplied())
                .commissionBaseAmount(order.getCommissionBaseAmount())
                .vendorPayout(order.getVendorPayout())
                .customer(VendorOrderSummaryResponse.Customer.builder()
                        .name(order.getUser() != null ? order.getUser().getName() : null)
                        .email(order.getUser() != null ? order.getUser().getEmail() : null)
                        .phone(order.getUser() != null ? order.getUser().getPhone() : null)
                        .build())
                .shippingAddress(VendorOrderDetailResponse.ShippingAddress.builder()
                        .fullName(order.getShippingAddress() != null ? order.getShippingAddress().getFullName() : null)
                        .phone(order.getShippingAddress() != null ? order.getShippingAddress().getPhone() : null)
                        .address(order.getShippingAddress() != null ? order.getShippingAddress().getDetail() : null)
                        .ward(order.getShippingAddress() != null ? order.getShippingAddress().getWard() : null)
                        .district(order.getShippingAddress() != null ? order.getShippingAddress().getDistrict() : null)
                        .city(order.getShippingAddress() != null ? order.getShippingAddress().getProvince() : null)
                        .build())
                .items((order.getItems() == null ? List.<OrderItem>of() : order.getItems()).stream()
                        .map(item -> VendorOrderDetailResponse.Item.builder()
                                .id(item.getId())
                                .name(item.getProductName())
                                .sku(item.getVariant() != null && item.getVariant().getSku() != null
                                        ? item.getVariant().getSku()
                                        : (item.getId() != null ? item.getId().toString() : ""))
                                .variant(item.getVariantName())
                                .quantity(item.getQuantity())
                                .unitPrice(item.getUnitPrice())
                                .totalPrice(item.getTotalPrice())
                                .image(item.getProductImage())
                                .build())
                        .toList())
                .build();
    }

    private List<PreparedOrderItem> prepareOrderItems(List<OrderRequest.OrderItemRequest> items, UUID buyerStoreId) {
        List<CheckoutProductLine> checkoutLines = resolveCheckoutProductLines(items, buyerStoreId);
        List<PreparedOrderItem> preparedItems = new ArrayList<>();

        for (CheckoutProductLine line : checkoutLines) {
            OrderRequest.OrderItemRequest itemReq = line.request();
            Product product = line.product();

            ProductVariant variant = resolveVariantForCheckout(product, itemReq.getVariantId());
            reserveStock(product, variant, itemReq.getQuantity());

            // Always resolve price server-side to prevent client-side price tampering.
            BigDecimal fallbackUnitPrice = resolveUnitPrice(product, variant);
            FlashSaleAllocation flashSaleAllocation = tryApplyFlashSaleAllocation(product, variant,
                    itemReq.getQuantity());
            BigDecimal unitPrice = flashSaleAllocation.applied() ? flashSaleAllocation.flashUnitPrice()
                    : fallbackUnitPrice;
            BigDecimal totalPrice = unitPrice.multiply(BigDecimal.valueOf(itemReq.getQuantity()));

            preparedItems.add(new PreparedOrderItem(
                    product,
                    variant,
                    itemReq.getQuantity(),
                    unitPrice,
                    totalPrice,
                    product.getStoreId(),
                    product.getName(),
                    buildVariantName(variant),
                    resolvePrimaryImage(product),
                    flashSaleAllocation.flashSaleItemId(),
                    flashSaleAllocation.applied() ? flashSaleAllocation.flashUnitPrice() : null));
        }

        return preparedItems;
    }

    private List<CheckoutProductLine> resolveCheckoutProductLines(
            List<OrderRequest.OrderItemRequest> items,
            UUID buyerStoreId) {
        List<CheckoutProductLine> checkoutLines = new ArrayList<>();

        for (OrderRequest.OrderItemRequest itemReq : items) {
            if (itemReq == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order item is required");
            }
            if (itemReq.getProductId() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Product ID is required");
            }
            if (itemReq.getQuantity() == null || itemReq.getQuantity() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity must be greater than 0");
            }

            Product product = productRepository.findPublicByIdForUpdate(itemReq.getProductId())
                    .orElseThrow(() -> new ResourceNotFoundException("Product not found"));

            if (product.getStoreId() == null) {
                throw new ForbiddenException("Marketplace checkout only supports vendor-owned products");
            }
            ensureNotOwnStoreProduct(buyerStoreId, product);
            checkoutLines.add(new CheckoutProductLine(itemReq, product));
        }

        return checkoutLines;
    }

    private void ensureNotOwnStoreProduct(UUID buyerStoreId, Product product) {
        if (buyerStoreId == null || product == null || product.getStoreId() == null) {
            return;
        }
        if (buyerStoreId.equals(product.getStoreId())) {
            throw new ForbiddenException(OWN_STORE_PURCHASE_MESSAGE);
        }
    }

    private ProductVariant resolveVariantForCheckout(Product product, UUID variantId) {
        if (variantId != null) {
            return productVariantRepository.findByIdForUpdate(variantId)
                    .filter(found -> found.getProduct().getId().equals(product.getId()))
                    .filter(found -> Boolean.TRUE.equals(found.getIsActive()))
                    .orElseThrow(() -> new ResourceNotFoundException("Product variant not found"));
        }

        List<ProductVariant> activeVariants = productVariantRepository.findByProductIdAndIsActiveTrue(product.getId());
        if (activeVariants.size() > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please select a product variant");
        }
        if (activeVariants.size() == 1) {
            UUID onlyVariantId = activeVariants.get(0).getId();
            return productVariantRepository.findByIdForUpdate(onlyVariantId)
                    .filter(found -> Boolean.TRUE.equals(found.getIsActive()))
                    .orElseThrow(() -> new ResourceNotFoundException("Product variant not found"));
        }
        return null;
    }

    private void reserveStock(Product product, ProductVariant variant, int quantity) {
        if (variant != null) {
            int available = safeInt(variant.getStockQuantity());
            if (available < quantity) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Insufficient stock for selected variant");
            }

            variant.setStockQuantity(available - quantity);

            Long activeVariantStock = productVariantRepository.sumActiveStockByProductId(product.getId());
            int productStock = activeVariantStock == null ? 0 : Math.max(0, activeVariantStock.intValue());
            product.setStockQuantity(productStock);
            return;
        }

        int available = safeInt(product.getStockQuantity());
        if (available < quantity) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Insufficient stock for product");
        }

        product.setStockQuantity(available - quantity);
    }

    private FlashSaleAllocation tryApplyFlashSaleAllocation(Product product, ProductVariant variant, int quantity) {
        if (flashSaleItemRepository == null || product == null || product.getId() == null || quantity <= 0) {
            return FlashSaleAllocation.none();
        }

        LocalDateTime now = LocalDateTime.now();
        FlashSaleItem candidate = null;
        if (variant != null && variant.getId() != null) {
            candidate = firstOrNull(flashSaleItemRepository.findActiveVariantItemForUpdate(
                    product.getId(),
                    variant.getId(),
                    FlashSaleItem.ItemStatus.ACTIVE,
                    FlashSaleCampaign.CampaignStatus.RUNNING,
                    now));
        }
        if (candidate == null) {
            candidate = firstOrNull(flashSaleItemRepository.findActiveProductItemForUpdate(
                    product.getId(),
                    FlashSaleItem.ItemStatus.ACTIVE,
                    FlashSaleCampaign.CampaignStatus.RUNNING,
                    now));
        }
        if (candidate == null) {
            return FlashSaleAllocation.none();
        }

        int quota = safeInt(candidate.getQuota());
        int soldCount = safeInt(candidate.getSoldCount());
        if (quota <= 0 || soldCount >= quota) {
            return FlashSaleAllocation.none();
        }
        if (soldCount + quantity > quota) {
            return FlashSaleAllocation.none();
        }

        BigDecimal flashPrice = safeAmount(candidate.getFlashPrice());
        if (flashPrice.compareTo(BigDecimal.ZERO) <= 0) {
            return FlashSaleAllocation.none();
        }

        candidate.setSoldCount(soldCount + quantity);
        flashSaleItemRepository.save(candidate);
        return new FlashSaleAllocation(candidate.getId(), flashPrice);
    }

    private Map<UUID, StoreOrderGroup> groupItemsByStore(List<PreparedOrderItem> preparedItems) {
        Map<UUID, List<PreparedOrderItem>> grouped = new LinkedHashMap<>();

        for (PreparedOrderItem item : preparedItems) {
            grouped.computeIfAbsent(item.storeId(), ignored -> new ArrayList<>()).add(item);
        }

        Map<UUID, StoreOrderGroup> result = new LinkedHashMap<>();
        for (Map.Entry<UUID, List<PreparedOrderItem>> entry : grouped.entrySet()) {
            BigDecimal subtotal = entry.getValue().stream().map(PreparedOrderItem::totalPrice).reduce(BigDecimal.ZERO,
                    BigDecimal::add);
            result.put(entry.getKey(), new StoreOrderGroup(entry.getKey(), entry.getValue(), subtotal));
        }
        return result;
    }

    private DiscountApplication resolveDiscountApplication(
            UUID userId,
            UUID customerVoucherId,
            String rawCode,
            Map<UUID, StoreOrderGroup> groupedByStore) {
        if (customerVoucherId != null) {
            return resolveCustomerWalletVoucherDiscount(userId, customerVoucherId, groupedByStore);
        }

        String normalizedCode = normalizeDiscountCode(rawCode);
        if (normalizedCode == null) {
            return DiscountApplication.none();
        }

        DiscountApplication voucherDiscount = resolveVoucherDiscount(normalizedCode, groupedByStore);
        if (voucherDiscount != null) {
            return voucherDiscount;
        }

        DiscountApplication couponDiscount = resolveLegacyCouponDiscount(normalizedCode, groupedByStore);
        if (couponDiscount != null) {
            return couponDiscount;
        }

        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid coupon code");
    }

    private DiscountApplication resolveCustomerWalletVoucherDiscount(
            UUID userId,
            UUID customerVoucherId,
            Map<UUID, StoreOrderGroup> groupedByStore) {
        if (customerVoucherRepository == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Customer voucher wallet is not available");
        }
        if (groupedByStore.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order must contain at least one item");
        }

        CustomerVoucher walletVoucher = customerVoucherRepository.findByIdAndUserIdForUpdate(customerVoucherId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Customer voucher not found in wallet"));

        if (walletVoucher.getWalletStatus() != CustomerVoucher.WalletStatus.AVAILABLE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Customer voucher is no longer available");
        }

        Voucher voucher = walletVoucher.getVoucher();
        StoreOrderGroup targetGroup = voucher == null ? null : groupedByStore.get(voucher.getStoreId());
        if (targetGroup == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher does not match cart stores");
        }

        validateVoucherForCheckout(voucher, targetGroup.subtotal());
        BigDecimal discount = calculateVoucherDiscount(voucher, targetGroup.subtotal());
        if (discount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher is not applicable for current order");
        }

        Map<UUID, BigDecimal> byStore = new LinkedHashMap<>();
        byStore.put(targetGroup.storeId(), discount);
        return new DiscountApplication(
                voucher.getCode(),
                discount,
                byStore,
                walletVoucher.getId(),
                null,
                voucher);
    }

    private DiscountApplication resolveVoucherDiscount(
            String normalizedCode,
            Map<UUID, StoreOrderGroup> groupedByStore) {
        if (groupedByStore.isEmpty()) {
            return null;
        }

        List<Voucher> matchedVouchers = voucherRepository.findByCodeAndStoreIds(
                normalizedCode,
                groupedByStore.keySet());
        if (matchedVouchers.isEmpty()) {
            return null;
        }
        if (matchedVouchers.size() > 1) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Voucher code is duplicated across multiple stores in cart");
        }

        Voucher voucher = matchedVouchers.get(0);
        StoreOrderGroup targetGroup = groupedByStore.get(voucher.getStoreId());
        if (targetGroup == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher does not match cart stores");
        }

        validateVoucherForCheckout(voucher, targetGroup.subtotal());
        BigDecimal discount = calculateVoucherDiscount(voucher, targetGroup.subtotal());
        if (discount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher is not applicable for current order");
        }

        Map<UUID, BigDecimal> byStore = new LinkedHashMap<>();
        byStore.put(targetGroup.storeId(), discount);
        return new DiscountApplication(voucher.getCode(), discount, byStore, null, null, voucher);
    }

    private DiscountApplication resolveLegacyCouponDiscount(
            String normalizedCode,
            Map<UUID, StoreOrderGroup> groupedByStore) {
        Coupon coupon = couponRepository.findByCode(normalizedCode).orElse(null);
        if (coupon == null) {
            return null;
        }
        if (!coupon.isValid()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Coupon is expired or fully used");
        }

        BigDecimal subtotal = groupedByStore.values().stream()
                .map(StoreOrderGroup::subtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal discount = BigDecimal.valueOf(coupon.calculateDiscount(subtotal.doubleValue()))
                .setScale(2, RoundingMode.HALF_UP);

        if (discount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order does not meet coupon conditions");
        }

        Map<UUID, BigDecimal> byStore = allocateDiscountByStore(groupedByStore, discount);
        return new DiscountApplication(coupon.getCode(), discount, byStore, null, coupon, null);
    }

    private void validateVoucherForCheckout(Voucher voucher, BigDecimal storeSubtotal) {
        if (voucher.getStatus() != Voucher.VoucherStatus.RUNNING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher is not active");
        }

        LocalDate today = LocalDate.now();
        if (voucher.getStartDate() != null && voucher.getStartDate().isAfter(today)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher is not active yet");
        }
        if (voucher.getEndDate() != null && voucher.getEndDate().isBefore(today)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher has expired");
        }

        int totalIssued = safeInt(voucher.getTotalIssued());
        int usedCount = safeInt(voucher.getUsedCount());
        if (totalIssued <= 0 || usedCount >= totalIssued) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher usage limit has been reached");
        }

        BigDecimal minOrderValue = safeAmount(voucher.getMinOrderValue());
        if (storeSubtotal.compareTo(minOrderValue) < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Order does not meet minimum value required for this voucher");
        }
    }

    private BigDecimal calculateVoucherDiscount(Voucher voucher, BigDecimal orderValue) {
        BigDecimal discountValue = safeAmount(voucher.getDiscountValue());
        if (voucher.getDiscountType() == Voucher.DiscountType.PERCENT) {
            return orderValue.multiply(discountValue)
                    .divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);
        }
        return discountValue.min(orderValue).setScale(2, RoundingMode.HALF_UP);
    }

    private Map<UUID, BigDecimal> allocateDiscountByStore(
            Map<UUID, StoreOrderGroup> groupedByStore,
            BigDecimal totalDiscount) {
        Map<UUID, BigDecimal> byStore = new LinkedHashMap<>();
        if (groupedByStore.isEmpty() || totalDiscount.compareTo(BigDecimal.ZERO) <= 0) {
            return byStore;
        }

        BigDecimal subtotal = groupedByStore.values().stream()
                .map(StoreOrderGroup::subtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (groupedByStore.size() == 1 || subtotal.compareTo(BigDecimal.ZERO) <= 0) {
            StoreOrderGroup only = groupedByStore.values().iterator().next();
            byStore.put(only.storeId(), totalDiscount);
            return byStore;
        }

        BigDecimal allocated = BigDecimal.ZERO;
        int index = 0;
        int size = groupedByStore.size();
        for (StoreOrderGroup group : groupedByStore.values()) {
            index++;
            BigDecimal value;
            if (index == size) {
                value = totalDiscount.subtract(allocated);
            } else {
                value = totalDiscount.multiply(group.subtotal())
                        .divide(subtotal, 2, RoundingMode.HALF_UP);
                allocated = allocated.add(value);
            }
            byStore.put(group.storeId(), value.max(BigDecimal.ZERO));
        }
        return byStore;
    }

    private void consumeDiscountUsageIfEligible(Order rootCandidate) {
        if (rootCandidate == null || rootCandidate.getId() == null) {
            return;
        }
        if (rootCandidate.getParentOrder() != null) {
            return;
        }
        if (Boolean.TRUE.equals(rootCandidate.getDiscountUsageConsumed())) {
            return;
        }
        UUID candidateCustomerVoucherId = rootCandidate.getCustomerVoucherId();
        String candidateCode = normalizeDiscountCode(rootCandidate.getCouponCode());
        if (candidateCustomerVoucherId == null && candidateCode == null) {
            return;
        }
        if (!isDiscountEligibleForConsumption(rootCandidate)) {
            return;
        }

        Order lockedRoot = orderRepository.findByIdForUpdate(rootCandidate.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Order not found"));

        if (lockedRoot.getParentOrder() != null) {
            return;
        }
        if (Boolean.TRUE.equals(lockedRoot.getDiscountUsageConsumed())) {
            return;
        }

        UUID customerVoucherId = lockedRoot.getCustomerVoucherId();
        String normalizedCode = normalizeDiscountCode(lockedRoot.getCouponCode());
        if (customerVoucherId == null && normalizedCode == null) {
            return;
        }
        if (!isDiscountEligibleForConsumption(lockedRoot)) {
            return;
        }

        boolean consumed = consumeCustomerVoucherUsageIfMatched(lockedRoot);
        if (!consumed && normalizedCode != null) {
            consumed = incrementVoucherUsageIfMatched(lockedRoot, normalizedCode);
        }
        if (!consumed && normalizedCode != null) {
            consumed = incrementCouponUsageIfMatched(normalizedCode);
        }
        if (!consumed) {
            return;
        }

        lockedRoot.setDiscountUsageConsumed(true);
        orderRepository.save(lockedRoot);
    }

    private boolean consumeCustomerVoucherUsageIfMatched(Order rootOrder) {
        if (rootOrder == null || rootOrder.getCustomerVoucherId() == null || customerVoucherRepository == null) {
            return false;
        }
        UUID userId = rootOrder.getUser() == null ? null : rootOrder.getUser().getId();
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Customer voucher owner is invalid");
        }

        CustomerVoucher walletVoucher = customerVoucherRepository.findByIdAndUserIdForUpdate(
                rootOrder.getCustomerVoucherId(),
                userId)
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.CONFLICT, "Customer voucher not found in wallet"));

        if (walletVoucher.getWalletStatus() == CustomerVoucher.WalletStatus.USED) {
            if (rootOrder.getId() != null && rootOrder.getId().equals(walletVoucher.getUsedOrderId())) {
                return true;
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Customer voucher has already been used");
        }
        if (walletVoucher.getWalletStatus() != CustomerVoucher.WalletStatus.AVAILABLE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Customer voucher is not available");
        }

        Voucher attachedVoucher = walletVoucher.getVoucher();
        if (attachedVoucher == null || attachedVoucher.getId() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Voucher is no longer valid");
        }

        Voucher lockedVoucher = voucherRepository.findByIdForUpdate(attachedVoucher.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Voucher not found"));

        int totalIssued = safeInt(lockedVoucher.getTotalIssued());
        int usedCount = safeInt(lockedVoucher.getUsedCount());
        if (totalIssued <= 0 || usedCount >= totalIssued) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Voucher usage limit has been reached");
        }

        lockedVoucher.setUsedCount(usedCount + 1);
        voucherRepository.save(lockedVoucher);

        walletVoucher.setWalletStatus(CustomerVoucher.WalletStatus.USED);
        walletVoucher.setUsedAt(LocalDateTime.now());
        walletVoucher.setUsedOrderId(rootOrder.getId());
        customerVoucherRepository.save(walletVoucher);
        return true;
    }

    private boolean isDiscountEligibleForConsumption(Order order) {
        if (order == null) {
            return false;
        }
        if (order.getPaymentMethod() == Order.PaymentMethod.COD) {
            return true;
        }
        return order.getPaymentStatus() == Order.PaymentStatus.PAID;
    }

    private boolean incrementCouponUsageIfMatched(String normalizedCode) {
        Coupon coupon = couponRepository.findByCodeForUpdate(normalizedCode).orElse(null);
        if (coupon == null) {
            return false;
        }
        int usedCount = safeInt(coupon.getUsedCount());
        Integer maxUses = coupon.getMaxUses();
        if (maxUses != null && usedCount >= maxUses) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Coupon usage limit has been reached");
        }
        coupon.setUsedCount(usedCount + 1);
        couponRepository.save(coupon);
        return true;
    }

    private boolean incrementVoucherUsageIfMatched(Order rootOrder, String normalizedCode) {
        Set<UUID> storeIds = new HashSet<>();
        if (rootOrder.getStoreId() != null) {
            storeIds.add(rootOrder.getStoreId());
        }
        if (rootOrder.isParentOrder()) {
            List<Order> subOrders = orderRepository.findByParentOrderOrderByCreatedAtDesc(rootOrder);
            for (Order subOrder : subOrders) {
                if (subOrder.getStoreId() != null) {
                    storeIds.add(subOrder.getStoreId());
                }
            }
        }
        if (storeIds.isEmpty()) {
            return false;
        }

        List<Voucher> matchedVouchers = voucherRepository.findByCodeAndStoreIdsForUpdate(normalizedCode, storeIds);
        if (matchedVouchers.isEmpty()) {
            return false;
        }
        if (matchedVouchers.size() > 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Voucher code is ambiguous for order stores");
        }

        Voucher voucher = matchedVouchers.get(0);
        int totalIssued = safeInt(voucher.getTotalIssued());
        int usedCount = safeInt(voucher.getUsedCount());
        if (totalIssued <= 0 || usedCount >= totalIssued) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Voucher usage limit has been reached");
        }
        voucher.setUsedCount(usedCount + 1);
        voucherRepository.save(voucher);
        return true;
    }

    private String normalizeDiscountCode(String rawCode) {
        if (rawCode == null) {
            return null;
        }
        String normalized = rawCode.trim().replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }

    private <T> T firstOrNull(List<T> rows) {
        if (rows == null || rows.isEmpty()) {
            return null;
        }
        return rows.get(0);
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : value;
    }

    private BigDecimal safeAmount(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value.max(BigDecimal.ZERO);
    }

    private Order createParentOrderWithSubOrders(
            User user,
            Address address,
            OrderRequest request,
            Order.PaymentMethod paymentMethod,
            List<PreparedOrderItem> preparedItems,
            Map<UUID, StoreOrderGroup> groupedByStore,
            DiscountApplication discountApplication) {
        BigDecimal subtotal = preparedItems.stream().map(PreparedOrderItem::totalPrice).reduce(BigDecimal.ZERO,
                BigDecimal::add);
        BigDecimal shippingFee = groupedByStore.values().stream()
                .map(g -> this.calculateShippingFee(address, g))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        CommissionSnapshot parentCommission = aggregateCommissionSnapshot(groupedByStore.values());
        BigDecimal commissionFee = parentCommission.feeAmount();

        BigDecimal discount = discountApplication.totalDiscount();
        BigDecimal vendorPayout = subtotal.add(shippingFee).subtract(commissionFee).subtract(discount);

        Order parentOrder = Order.builder()
                .orderCode(publicCodeService.nextOrderCode())
                .user(user)
                .shippingAddress(address)
                .status(Order.OrderStatus.PENDING)
                .paymentMethod(paymentMethod)
                .paymentStatus(Order.PaymentStatus.UNPAID)
                .subtotal(subtotal)
                .shippingFee(shippingFee)
                .discount(discount)
                .couponCode(discountApplication.code())
                .customerVoucherId(discountApplication.customerVoucherId())
                .note(buildParentOrderNote(request.getNote(), groupedByStore.size()))
                .commissionFee(commissionFee)
                .commissionRateApplied(parentCommission.rateApplied())
                .commissionBaseAmount(parentCommission.baseAmount())
                .vendorPayout(vendorPayout)
                .build();
        parentOrder.calculateTotal();

        Order persistedParent = orderRepository.save(parentOrder);
        recordOrderCreated(persistedParent);

        for (PreparedOrderItem item : preparedItems) {
            persistedParent.getItems().add(buildOrderItem(persistedParent, item));
        }
        persistedParent = orderRepository.save(persistedParent);

        for (StoreOrderGroup group : groupedByStore.values()) {
            BigDecimal storeDiscount = discountApplication.discountForStore(group.storeId());
            createStoreScopedOrder(
                    user,
                    address,
                    request,
                    paymentMethod,
                    group,
                    persistedParent,
                    discountApplication,
                    storeDiscount);
        }

        return persistedParent;
    }

    private Order createStoreScopedOrder(
            User user,
            Address address,
            OrderRequest request,
            Order.PaymentMethod paymentMethod,
            StoreOrderGroup group,
            Order parentOrder,
            DiscountApplication discountApplication,
            BigDecimal preCalculatedDiscount) {
        BigDecimal shippingFee = calculateShippingFee(address, group);
        CommissionSnapshot commissionSnapshot = calculateCommissionSnapshot(group);
        BigDecimal commissionFee = commissionSnapshot.feeAmount();
        BigDecimal discount = preCalculatedDiscount;
        BigDecimal vendorPayout = group.subtotal().add(shippingFee).subtract(commissionFee).subtract(discount);

        Order order = Order.builder()
                .orderCode(publicCodeService.nextOrderCode())
                .user(user)
                .shippingAddress(address)
                .status(Order.OrderStatus.PENDING)
                .paymentMethod(paymentMethod)
                .paymentStatus(Order.PaymentStatus.UNPAID)
                .subtotal(group.subtotal())
                .shippingFee(shippingFee)
                .discount(discount)
                .couponCode(discountApplication.code())
                .customerVoucherId(discountApplication.customerVoucherId())
                .note(request.getNote())
                .storeId(group.storeId())
                .parentOrder(parentOrder)
                .commissionFee(commissionFee)
                .commissionRateApplied(commissionSnapshot.rateApplied())
                .commissionBaseAmount(commissionSnapshot.baseAmount())
                .vendorPayout(vendorPayout)
                .build();
        order.calculateTotal();

        Order savedOrder = orderRepository.save(order);
        for (PreparedOrderItem item : group.items()) {
            savedOrder.getItems().add(buildOrderItem(savedOrder, item));
        }
        Order persistedOrder = orderRepository.save(savedOrder);
        recordOrderCreated(persistedOrder);
        return persistedOrder;
    }

    private OrderItem buildOrderItem(Order order, PreparedOrderItem item) {
        return OrderItem.builder()
                .order(order)
                .product(item.product())
                .variant(item.variant())
                .productName(item.productName())
                .variantName(item.variantName())
                .productImage(item.productImage())
                .quantity(item.quantity())
                .unitPrice(item.unitPrice())
                .totalPrice(item.totalPrice())
                .storeId(item.storeId())
                .flashSaleItemId(item.flashSaleItemId())
                .flashSaleUnitPrice(item.flashSaleUnitPrice())
                .build();
    }

    private BigDecimal calculateShippingFee(Address address, StoreOrderGroup group) {
        if (group.subtotal().compareTo(FREE_SHIPPING_THRESHOLD) >= 0) {
            return BigDecimal.ZERO;
        }

        if (address != null && address.getGhnDistrictId() != null && address.getGhnWardCode() != null
                && ghnService != null) {
            Integer fromDistrictId = 1450;
            try {
                Store store = storeRepository.findById(group.storeId()).orElse(null);
                if (store != null && store.getGhnDistrictId() != null) {
                    fromDistrictId = store.getGhnDistrictId();
                } else if (ghnService.getDefaultFromDistrictId() != null) {
                    fromDistrictId = ghnService.getDefaultFromDistrictId();
                }
            } catch (Exception e) {
                org.slf4j.LoggerFactory.getLogger(OrderService.class).warn(
                        "Could not retrieve store warehouse address, using global default from district. Error: {}",
                        e.getMessage());
            }

            int totalWeight = group.items().stream()
                    .mapToInt(item -> item.quantity() * 300)
                    .sum();
            if (totalWeight <= 0) {
                totalWeight = 500;
            }

            BigDecimal fee = ghnService.calculateShippingFee(
                    fromDistrictId,
                    address.getGhnDistrictId(),
                    address.getGhnWardCode(),
                    totalWeight,
                    group.subtotal());

            if (fee != null) {
                return fee;
            }
        }

        return DEFAULT_SHIPPING_FEE;
    }

    private BigDecimal calculateCommissionFee(StoreOrderGroup group) {
        return calculateCommissionSnapshot(group).feeAmount();
    }

    private CommissionSnapshot calculateCommissionSnapshot(StoreOrderGroup group) {
        Store store = storeRepository.findById(group.storeId())
                .orElseThrow(() -> new ResourceNotFoundException("Store not found"));
        BigDecimal commissionRatePercent = resolveCommissionRatePercent(store);
        BigDecimal commissionBaseAmount = group.subtotal();
        BigDecimal commissionFee = commissionBaseAmount
                .multiply(commissionRatePercent)
                .divide(COMMISSION_RATE_DIVISOR, 2, RoundingMode.HALF_UP);
        return new CommissionSnapshot(commissionRatePercent, commissionBaseAmount, commissionFee);
    }

    private CommissionSnapshot aggregateCommissionSnapshot(Iterable<StoreOrderGroup> groups) {
        BigDecimal totalBase = BigDecimal.ZERO;
        BigDecimal totalFee = BigDecimal.ZERO;
        for (StoreOrderGroup group : groups) {
            CommissionSnapshot snapshot = calculateCommissionSnapshot(group);
            totalBase = totalBase.add(snapshot.baseAmount());
            totalFee = totalFee.add(snapshot.feeAmount());
        }

        BigDecimal aggregatedRate = totalBase.compareTo(BigDecimal.ZERO) > 0
                ? totalFee.multiply(COMMISSION_RATE_DIVISOR).divide(totalBase, 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        return new CommissionSnapshot(aggregatedRate, totalBase, totalFee);
    }

    private BigDecimal resolveCommissionRatePercent(Store store) {
        if (platformCommissionSettingsService != null) {
            return platformCommissionSettingsService.resolveEffectiveCommissionRate(store);
        }
        BigDecimal rawRate = store != null ? store.getCommissionRate() : null;
        if (rawRate == null || rawRate.compareTo(BigDecimal.ZERO) <= 0) {
            return DEFAULT_COMMISSION_RATE_PERCENT;
        }
        return rawRate;
    }

    private Order processOrderAfterCheckout(Order createdOrder) {
        boolean onlinePayment = isOnlinePaymentMethod(createdOrder.getPaymentMethod());
        boolean paid = createdOrder.getPaymentStatus() == Order.PaymentStatus.PAID;

        if (!onlinePayment || paid) {
            return moveOrderToWaitingForVendor(createdOrder);
        }

        return createdOrder;
    }

    private boolean isOnlinePaymentMethod(Order.PaymentMethod paymentMethod) {
        return paymentMethod != null && paymentMethod != Order.PaymentMethod.COD;
    }

    private boolean shouldMarkRefundPendingOnCancellation(Order order) {
        if (order == null) {
            return false;
        }
        Order.PaymentMethod paymentMethod = order.getPaymentMethod();
        Order.PaymentStatus paymentStatus = order.getPaymentStatus();
        if (order.getParentOrder() != null) {
            if (paymentMethod == null) {
                paymentMethod = order.getParentOrder().getPaymentMethod();
            }
            if (paymentStatus != Order.PaymentStatus.PAID && paymentStatus != Order.PaymentStatus.REFUND_PENDING) {
                paymentStatus = order.getParentOrder().getPaymentStatus();
            }
        }
        return isOnlinePaymentMethod(paymentMethod)
                && (paymentStatus == Order.PaymentStatus.PAID || paymentStatus == Order.PaymentStatus.REFUND_PENDING);
    }

    private Order moveOrderToWaitingForVendor(Order order) {
        if (order.isParentOrder()) {
            List<Order> subOrders = orderRepository.findByParentOrderOrderByCreatedAtDesc(order);
            LocalDateTime deadlineStart = LocalDateTime.now();
            for (Order subOrder : subOrders) {
                if (subOrder.getStatus() == Order.OrderStatus.PENDING) {
                    Order.OrderStatus previousStatus = subOrder.getStatus();
                    subOrder.setStatus(Order.OrderStatus.WAITING_FOR_VENDOR);
                    assignVendorConfirmationDeadline(subOrder, deadlineStart);
                    Order savedSubOrder = orderRepository.save(subOrder);
                    recordStatusTransition(savedSubOrder, previousStatus, savedSubOrder.getStatus(), null);
                    publishVendorReadyNotification(savedSubOrder);
                }
            }
            return syncParentOrderStatus(order.getId());
        }

        if (order.getStatus() == Order.OrderStatus.PENDING) {
            Order.OrderStatus previousStatus = order.getStatus();
            order.setStatus(Order.OrderStatus.WAITING_FOR_VENDOR);
            assignVendorConfirmationDeadline(order, LocalDateTime.now());
            Order saved = orderRepository.save(order);
            recordStatusTransition(saved, previousStatus, saved.getStatus(), null);
            publishVendorReadyNotification(saved);
            if (saved.isSubOrder()) {
                return syncParentOrderStatus(saved.getParentOrder().getId());
            }
            return saved;
        }
        return order;
    }

    private void publishVendorReadyNotification(Order subOrder) {
        if (subOrder.getStoreId() == null) {
            return;
        }
        String paymentMethod = subOrder.getPaymentMethod() == null ? "UNKNOWN" : subOrder.getPaymentMethod().name();
        String message = subOrder.getPaymentMethod() == Order.PaymentMethod.COD
                ? "New COD Order received. Please confirm."
                : "Order Paid. Please start packing.";
        applicationEventPublisher.publishEvent(new SubOrderReadyForVendorEvent(
                subOrder.getId(),
                subOrder.getStoreId(),
                subOrder.getOrderCode(),
                paymentMethod,
                message));
    }

    private BigDecimal resolveUnitPrice(Product product, ProductVariant variant) {
        BigDecimal resolvedPrice = variant != null ? variant.getPrice() : product.getEffectivePrice();
        if (resolvedPrice == null || resolvedPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Product price is invalid");
        }
        return resolvedPrice;
    }

    private String resolvePrimaryImage(Product product) {
        if (product.getImages() == null || product.getImages().isEmpty()) {
            return null;
        }
        return product.getImages().stream()
                .sorted((left, right) -> Boolean.compare(Boolean.TRUE.equals(right.getIsPrimary()),
                        Boolean.TRUE.equals(left.getIsPrimary())))
                .map(ProductImage::getUrl)
                .findFirst()
                .orElse(null);
    }

    private String buildVariantName(ProductVariant variant) {
        if (variant == null) {
            return null;
        }
        String color = variant.getColor() != null ? variant.getColor() : "";
        String size = variant.getSize() != null ? variant.getSize() : "";
        if (!color.isBlank() && !size.isBlank()) {
            return color + " / " + size;
        }
        if (!color.isBlank()) {
            return color;
        }
        return size.isBlank() ? null : size;
    }

    private String buildParentOrderNote(String originalNote, int vendorCount) {
        String splitNote = "Marketplace order split into " + vendorCount + " vendor sub-orders.";
        if (originalNote == null || originalNote.isBlank()) {
            return splitNote;
        }
        return originalNote + "\n" + splitNote;
    }

    private Order syncParentOrderStatus(UUID parentOrderId) {
        Order parentOrder = findById(parentOrderId);
        Order.OrderStatus previousStatus = parentOrder.getStatus();
        List<Order> subOrders = orderRepository.findByParentOrderIdOrderByCreatedAtDesc(parentOrderId);
        if (subOrders.isEmpty()) {
            return parentOrder;
        }

        Order.OrderStatus aggregateStatus = deriveParentStatus(subOrders);
        parentOrder.setStatus(aggregateStatus);

        boolean allDelivered = subOrders.stream()
                .allMatch(subOrder -> subOrder.getStatus() == Order.OrderStatus.DELIVERED);
        boolean allCancelled = subOrders.stream()
                .allMatch(subOrder -> subOrder.getStatus() == Order.OrderStatus.CANCELLED);
        boolean anyCancelled = subOrders.stream()
                .anyMatch(subOrder -> subOrder.getStatus() == Order.OrderStatus.CANCELLED);

        if (allDelivered) {
            parentOrder.setPaymentStatus(Order.PaymentStatus.PAID);
            if (parentOrder.getPaidAt() == null) {
                parentOrder.setPaidAt(LocalDateTime.now());
            }
            if (parentOrder.getDeliveredAt() == null) {
                parentOrder.setDeliveredAt(LocalDateTime.now());
            }
        } else if (allCancelled) {
            parentOrder.setPaymentStatus(shouldMarkRefundPendingOnCancellation(parentOrder)
                    ? Order.PaymentStatus.REFUND_PENDING
                    : Order.PaymentStatus.FAILED);
            parentOrder.setDeliveredAt(null);
        } else {
            if (anyCancelled && shouldMarkRefundPendingOnCancellation(parentOrder)) {
                parentOrder.setPaymentStatus(Order.PaymentStatus.REFUND_PENDING);
            }
            parentOrder.setDeliveredAt(null);
        }

        Order savedParent = orderRepository.save(parentOrder);
        recordStatusTransition(savedParent, previousStatus, savedParent.getStatus(), null);
        if (savedParent.getPaymentStatus() == Order.PaymentStatus.PAID) {
            consumeDiscountUsageIfEligible(savedParent);
        }
        notifyCustomerOrderStatusChanged(savedParent, previousStatus, savedParent.getStatus());
        return savedParent;
    }

    private Order.OrderStatus deriveParentStatus(List<Order> subOrders) {
        boolean allCancelled = subOrders.stream()
                .allMatch(subOrder -> subOrder.getStatus() == Order.OrderStatus.CANCELLED);
        if (allCancelled) {
            return Order.OrderStatus.CANCELLED;
        }

        boolean allDelivered = subOrders.stream()
                .filter(subOrder -> subOrder.getStatus() != Order.OrderStatus.CANCELLED)
                .allMatch(subOrder -> subOrder.getStatus() == Order.OrderStatus.DELIVERED);
        if (allDelivered) {
            return Order.OrderStatus.DELIVERED;
        }

        boolean allInShippingGroup = subOrders.stream()
                .filter(subOrder -> subOrder.getStatus() != Order.OrderStatus.CANCELLED)
                .allMatch(subOrder -> subOrder.getStatus() == Order.OrderStatus.SHIPPED
                        || subOrder.getStatus() == Order.OrderStatus.DELIVERED);
        if (allInShippingGroup) {
            return Order.OrderStatus.SHIPPED;
        }

        if (subOrders.stream().anyMatch(subOrder -> subOrder.getStatus() == Order.OrderStatus.PROCESSING)) {
            return Order.OrderStatus.PROCESSING;
        }

        if (subOrders.stream().anyMatch(subOrder -> subOrder.getStatus() == Order.OrderStatus.CONFIRMED)) {
            return Order.OrderStatus.CONFIRMED;
        }

        if (subOrders.stream().anyMatch(subOrder -> subOrder.getStatus() == Order.OrderStatus.WAITING_FOR_VENDOR)) {
            return Order.OrderStatus.WAITING_FOR_VENDOR;
        }

        return Order.OrderStatus.PENDING;
    }

    private void notifyCustomerOrderCreated(Order order) {
        if (notificationDomainService == null || order == null || order.getUser() == null) {
            return;
        }
        if (isOnlinePaymentMethod(order.getPaymentMethod()) && order.getPaymentStatus() != Order.PaymentStatus.PAID) {
            return;
        }
        if (order.getParentOrder() != null) {
            return;
        }
        String code = resolveOrderDisplayCode(order);
        String title = "Đơn #" + code + " đã được tạo";
        String message = "Đơn hàng của bạn đã được tiếp nhận thành công.";
        notificationDomainService.createAndPush(
                order.getUser().getId(),
                Notification.NotificationType.ORDER,
                title,
                message,
                buildOrderDetailLink(order));
    }

    private void notifyCustomerPaymentSuccess(Order order) {
        if (notificationDomainService == null || order == null || order.getUser() == null) {
            return;
        }
        if (order.getParentOrder() != null) {
            return;
        }
        String code = resolveOrderDisplayCode(order);
        String title = "Thanh toán thành công cho đơn #" + code;
        String message = "Hệ thống đã ghi nhận thanh toán của bạn.";
        notificationDomainService.createAndPush(
                order.getUser().getId(),
                Notification.NotificationType.ORDER,
                title,
                message,
                buildOrderDetailLink(order));
    }

    private void notifyCustomerOrderStatusChanged(Order order, Order.OrderStatus previousStatus,
            Order.OrderStatus currentStatus) {
        if (notificationDomainService == null || order == null || order.getUser() == null) {
            return;
        }
        if (order.getParentOrder() != null) {
            return;
        }
        if (previousStatus == currentStatus || currentStatus == null
                || !CUSTOMER_NOTIFICATION_STATUSES.contains(currentStatus)) {
            return;
        }

        String code = resolveOrderDisplayCode(order);
        String title = "Đơn #" + code + " " + customerStatusTitle(order, currentStatus);
        String message = customerStatusMessage(order, currentStatus);
        notificationDomainService.createAndPush(
                order.getUser().getId(),
                Notification.NotificationType.ORDER,
                title,
                message,
                buildOrderDetailLink(order));
    }

    private String customerStatusTitle(Order order, Order.OrderStatus status) {
        if (status == Order.OrderStatus.CANCELLED && hasVendorSlaCancelReason(order)) {
            return "tự hủy do shop quá hạn xác nhận";
        }
        return switch (status) {
            case WAITING_FOR_VENDOR -> "đã được tiếp nhận";
            case CONFIRMED -> "đã được xác nhận";
            case PROCESSING -> "đang được chuẩn bị";
            case SHIPPED -> "đang được giao";
            case DELIVERED -> "đã giao thành công";
            case CANCELLED -> "đã bị hủy";
            default -> "đã được cập nhật";
        };
    }

    private String customerStatusMessage(Order order, Order.OrderStatus status) {
        if (status == Order.OrderStatus.CANCELLED && hasVendorSlaCancelReason(order)) {
            return "Đơn tự hủy do shop không xử lý quá " + vendorConfirmationSlaDays()
                    + " ngày. Nếu đã thanh toán, hệ thống sẽ chuyển sang trạng thái chờ hoàn tiền.";
        }
        return switch (status) {
            case WAITING_FOR_VENDOR -> "Người bán sẽ xác nhận đơn của bạn trong thời gian sớm nhất.";
            case CONFIRMED -> "Người bán đã xác nhận đơn hàng của bạn.";
            case PROCESSING -> "Đơn hàng đang được chuẩn bị để bàn giao đơn vị vận chuyển.";
            case SHIPPED -> "Đơn hàng đang trên đường giao tới bạn.";
            case DELIVERED -> "Đơn hàng đã được giao thành công.";
            case CANCELLED -> "Đơn hàng đã bị hủy. Nếu đã thanh toán, hệ thống sẽ xử lý hoàn tiền theo chính sách.";
            default -> "Trạng thái đơn hàng của bạn đã được cập nhật.";
        };
    }

    private boolean hasVendorSlaCancelReason(Order order) {
        if (order == null) {
            return false;
        }
        return normalizeOptionalText(order.getNote()).contains(vendorConfirmationSlaCancelReason());
    }

    private String buildOrderDetailLink(Order order) {
        return "/profile/orders/" + resolveOrderDisplayCode(order);
    }

    private String resolveOrderDisplayCode(Order order) {
        if (order == null) {
            return "";
        }
        String orderCode = normalizeOptionalText(order.getOrderCode());
        if (!orderCode.isEmpty()) {
            return orderCode;
        }
        return order.getId() == null ? "" : order.getId().toString();
    }

    private String safeEnumName(Enum<?> value) {
        return value == null ? null : value.name();
    }

    private void writeAdminAuditLog(
            UUID actorId,
            String actorEmail,
            String domain,
            String action,
            UUID targetId,
            boolean success,
            String note) {
        if (adminAuditLogService == null)
            return;
        adminAuditLogService.logAction(actorId, actorEmail, domain, action, targetId, success, note);
    }

    public UUID resolveOrderId(String idOrCode) {
        if (idOrCode == null || idOrCode.isBlank()) {
            throw new ResourceNotFoundException("Order not found");
        }
        try {
            return UUID.fromString(idOrCode.trim());
        } catch (IllegalArgumentException ex) {
            return findByCode(idOrCode).getId();
        }
    }
}
