package vn.edu.hcmuaf.fit.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.dto.request.OrderRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AdminOrderResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.NotificationResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Address;
import vn.edu.hcmuaf.fit.marketplace.entity.Coupon;
import vn.edu.hcmuaf.fit.marketplace.entity.CustomerVoucher;
import vn.edu.hcmuaf.fit.marketplace.entity.Notification;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.OrderItem;
import vn.edu.hcmuaf.fit.marketplace.entity.OrderStatusLog;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductImage;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductVariant;
import vn.edu.hcmuaf.fit.marketplace.entity.PlatformSetting;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.entity.Voucher;
import vn.edu.hcmuaf.fit.marketplace.exception.ForbiddenException;
import vn.edu.hcmuaf.fit.marketplace.repository.AddressRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.CouponRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.CustomerVoucherRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.FlashSaleItemRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderStatusLogRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.PlatformSettingRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductVariantRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.VoucherRepository;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Queue;
import java.util.UUID;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private AddressRepository addressRepository;

    @Mock
    private ProductRepository productRepository;

    @Mock
    private ProductVariantRepository productVariantRepository;

    @Mock
    private FlashSaleItemRepository flashSaleItemRepository;

    @Mock
    private StoreRepository storeRepository;

    @Mock
    private CouponRepository couponRepository;

    @Mock
    private VoucherRepository voucherRepository;

    @Mock
    private CustomerVoucherRepository customerVoucherRepository;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    private NotificationDomainService notificationDomainService;

    @Mock
    private OrderStatusLogRepository orderStatusLogRepository;

    private OrderService orderService;
    private RecordingWalletService walletService;
    private FixedPublicCodeService publicCodeService;

    private UUID orderId;
    private UUID storeId;

    @BeforeEach
    void setUp() {
        orderId = UUID.randomUUID();
        storeId = UUID.randomUUID();
        walletService = new RecordingWalletService();
        publicCodeService = new FixedPublicCodeService();
        notificationDomainService = new NoopNotificationDomainService();
        orderService = new OrderService(
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
                eventPublisher,
                null,
                notificationDomainService,
                orderStatusLogRepository
        );
    }

    @Test
    void vendorCannotShipWithoutTrackingAndCarrier() {
        Order order = buildStoreOrder(Order.OrderStatus.PROCESSING);
        when(orderRepository.findByIdAndStoreId(orderId, storeId)).thenReturn(Optional.of(order));

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> orderService.updateStatusForStore(orderId, storeId, Order.OrderStatus.SHIPPED, null, null, null)
        );

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Tracking number is required"));
    }

    @Test
    void vendorCanShipUsingExistingTrackingAndCarrier() {
        Order order = buildStoreOrder(Order.OrderStatus.PROCESSING);
        order.setTrackingNumber("GHN123456");
        order.setShippingCarrier("GHN");
        when(orderRepository.findByIdAndStoreId(orderId, storeId)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order updated = orderService.updateStatusForStore(
                orderId,
                storeId,
                Order.OrderStatus.SHIPPED,
                null,
                null,
                null
        );

        assertEquals(Order.OrderStatus.SHIPPED, updated.getStatus());
        assertEquals("GHN123456", updated.getTrackingNumber());
        assertEquals("GHN", updated.getShippingCarrier());
    }

    @Test
    void vendorCancelRequiresReason() {
        Order order = buildStoreOrder(Order.OrderStatus.CONFIRMED);
        when(orderRepository.findByIdAndStoreId(orderId, storeId)).thenReturn(Optional.of(order));

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> orderService.updateStatusForStore(
                        orderId,
                        storeId,
                        Order.OrderStatus.CANCELLED,
                        null,
                        null,
                        "   "
                )
        );

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Cancellation reason is required", ex.getReason());
    }

    @Test
    void deliveredRequiresTrackingData() {
        Order order = buildStoreOrder(Order.OrderStatus.SHIPPED);
        when(orderRepository.findByIdAndStoreId(orderId, storeId)).thenReturn(Optional.of(order));

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> orderService.updateStatusForStore(orderId, storeId, Order.OrderStatus.DELIVERED, null, null, null)
        );

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Tracking number is required"));
    }

    @Test
    void trackingCanOnlyBeUpdatedFromProcessingOrShipped() {
        Order order = buildStoreOrder(Order.OrderStatus.PENDING);
        when(orderRepository.findByIdAndStoreId(orderId, storeId)).thenReturn(Optional.of(order));

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> orderService.updateTrackingForStore(orderId, storeId, "GHN-999")
        );

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Tracking can only be updated when order is PROCESSING or SHIPPED", ex.getReason());
    }

    @Test
    void createSingleStoreOrderUsesStoreCommissionRateAndReservesStock() {
        UUID userId = UUID.randomUUID();
        UUID addressId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();

        User user = User.builder()
                .id(userId)
                .email("buyer@example.com")
                .password("secret")
                .role(User.Role.VENDOR)
                .storeId(UUID.randomUUID())
                .build();

        Address address = Address.builder()
                .id(addressId)
                .user(user)
                .fullName("Buyer")
                .phone("0900000000")
                .province("HCM")
                .district("Q1")
                .ward("Ben Nghe")
                .detail("1 Test Street")
                .build();

        Product product = Product.builder()
                .id(productId)
                .name("T-Shirt")
                .storeId(storeId)
                .basePrice(new BigDecimal("100000"))
                .salePrice(new BigDecimal("80000"))
                .stockQuantity(5)
                .build();
        product.setImages(List.of(
                ProductImage.builder()
                        .product(product)
                        .url("https://example.com/p.jpg")
                        .isPrimary(true)
                        .build()
        ));

        ProductVariant variant = ProductVariant.builder()
                .id(variantId)
                .product(product)
                .sku("TS-RED-M")
                .isActive(true)
                .stockQuantity(5)
                .priceAdjustment(BigDecimal.ZERO)
                .build();

        Store store = Store.builder()
                .id(storeId)
                .name("Store A")
                .commissionRate(new BigDecimal("10.0"))
                .build();

        OrderRequest request = OrderRequest.builder()
                .addressId(addressId)
                .paymentMethod("COD")
                .items(List.of(
                        OrderRequest.OrderItemRequest.builder()
                                .productId(productId)
                                .variantId(variantId)
                                .quantity(2)
                                .unitPrice(BigDecimal.ONE) // ignored by server-side pricing
                                .build()
                ))
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(addressRepository.findById(addressId)).thenReturn(Optional.of(address));
        when(productRepository.findPublicByIdForUpdate(productId)).thenReturn(Optional.of(product));
        when(productVariantRepository.findByIdForUpdate(variantId)).thenReturn(Optional.of(variant));
        when(productVariantRepository.sumActiveStockByProductId(productId)).thenReturn(3L);
        when(storeRepository.findById(storeId)).thenReturn(Optional.of(store));
        publicCodeService.pushOrderCode("DH-260401-000001");
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AdminOrderResponse response = orderService.create(userId, request);

        assertEquals(0, response.getSubtotal().compareTo(new BigDecimal("160000")));
        assertEquals(0, response.getCommissionRateApplied().compareTo(new BigDecimal("10.0000")));
        assertEquals(0, response.getCommissionBaseAmount().compareTo(new BigDecimal("160000")));
        assertEquals(0, response.getCommissionFee().compareTo(new BigDecimal("16000.00")));
        assertEquals(0, response.getVendorPayout().compareTo(new BigDecimal("174000.00")));
        assertEquals(3, variant.getStockQuantity());
        assertEquals(3, product.getStockQuantity());
    }

    @Test
    void createSingleStoreOrderUsesPlatformDefaultCommissionWhenStoreUsesDefault() {
        UUID userId = UUID.randomUUID();
        UUID addressId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();

        PlatformSettingRepository platformSettingRepository =
                org.mockito.Mockito.mock(PlatformSettingRepository.class);
        when(platformSettingRepository.findBySettingKey(any()))
                .thenReturn(Optional.of(PlatformSetting.builder()
                        .settingKey("defaultCommissionRate")
                        .settingValue("7.5")
                        .build()));
        PlatformCommissionSettingsService commissionSettingsService = new PlatformCommissionSettingsService(
                platformSettingRepository,
                storeRepository,
                null
        );
        OrderService serviceWithCommissionPolicy = new OrderService(
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
                eventPublisher,
                null,
                notificationDomainService,
                orderStatusLogRepository,
                commissionSettingsService
        );

        User user = User.builder()
                .id(userId)
                .email("buyer@example.com")
                .password("secret")
                .role(User.Role.CUSTOMER)
                .build();
        Address address = Address.builder()
                .id(addressId)
                .user(user)
                .fullName("Buyer")
                .phone("0900000000")
                .province("HCM")
                .district("Q1")
                .ward("Ben Nghe")
                .detail("1 Test Street")
                .build();
        Product product = Product.builder()
                .id(productId)
                .name("T-Shirt")
                .storeId(storeId)
                .basePrice(new BigDecimal("100000"))
                .salePrice(new BigDecimal("80000"))
                .stockQuantity(5)
                .build();
        ProductVariant variant = ProductVariant.builder()
                .id(variantId)
                .product(product)
                .sku("TS-BLACK-M")
                .isActive(true)
                .stockQuantity(5)
                .priceAdjustment(BigDecimal.ZERO)
                .build();
        Store store = Store.builder()
                .id(storeId)
                .name("Store A")
                .commissionRate(new BigDecimal("5.0"))
                .usesDefaultCommissionRate(true)
                .build();
        OrderRequest request = OrderRequest.builder()
                .addressId(addressId)
                .paymentMethod("COD")
                .items(List.of(
                        OrderRequest.OrderItemRequest.builder()
                                .productId(productId)
                                .variantId(variantId)
                                .quantity(2)
                                .unitPrice(BigDecimal.ONE)
                                .build()
                ))
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(addressRepository.findById(addressId)).thenReturn(Optional.of(address));
        when(productRepository.findPublicByIdForUpdate(productId)).thenReturn(Optional.of(product));
        when(productVariantRepository.findByIdForUpdate(variantId)).thenReturn(Optional.of(variant));
        when(productVariantRepository.sumActiveStockByProductId(productId)).thenReturn(3L);
        when(storeRepository.findById(storeId)).thenReturn(Optional.of(store));
        publicCodeService.pushOrderCode("DH-260401-000002");
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AdminOrderResponse response = serviceWithCommissionPolicy.create(userId, request);

        assertEquals(0, response.getCommissionRateApplied().compareTo(new BigDecimal("7.5000")));
        assertEquals(0, response.getCommissionFee().compareTo(new BigDecimal("12000.00")));
        assertEquals(0, response.getVendorPayout().compareTo(new BigDecimal("178000.00")));
    }

    @Test
    void createRejectsProductFromUsersOwnStoreBeforeReservingStock() {
        UUID userId = UUID.randomUUID();
        UUID addressId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        User user = User.builder()
                .id(userId)
                .email("vendor@example.com")
                .password("secret")
                .role(User.Role.VENDOR)
                .storeId(storeId)
                .build();
        Address address = Address.builder()
                .id(addressId)
                .user(user)
                .fullName("Vendor")
                .phone("0900000000")
                .province("HCM")
                .district("Q1")
                .ward("Ben Nghe")
                .detail("1 Test Street")
                .build();
        Product product = Product.builder()
                .id(productId)
                .name("Own Store Shirt")
                .storeId(storeId)
                .basePrice(new BigDecimal("100000"))
                .stockQuantity(5)
                .build();
        OrderRequest request = OrderRequest.builder()
                .addressId(addressId)
                .paymentMethod("COD")
                .items(List.of(
                        OrderRequest.OrderItemRequest.builder()
                                .productId(productId)
                                .quantity(2)
                                .build()
                ))
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(addressRepository.findById(addressId)).thenReturn(Optional.of(address));
        when(productRepository.findPublicByIdForUpdate(productId)).thenReturn(Optional.of(product));

        ForbiddenException ex = assertThrows(ForbiddenException.class, () -> orderService.create(userId, request));

        assertEquals("Khong the mua san pham tu gian hang cua chinh ban.", ex.getMessage());
        assertEquals(5, product.getStockQuantity());
        verify(orderRepository, never()).save(any(Order.class));
        verify(productVariantRepository, never()).findByProductIdAndIsActiveTrue(any());
    }

    @Test
    void createRejectsMultiStoreCheckoutWhenAnyItemBelongsToUsersOwnStore() {
        UUID userId = UUID.randomUUID();
        UUID addressId = UUID.randomUUID();
        UUID otherProductId = UUID.randomUUID();
        UUID ownProductId = UUID.randomUUID();
        UUID otherStoreId = UUID.randomUUID();

        User user = User.builder()
                .id(userId)
                .email("vendor@example.com")
                .password("secret")
                .role(User.Role.VENDOR)
                .storeId(storeId)
                .build();
        Address address = Address.builder()
                .id(addressId)
                .user(user)
                .fullName("Vendor")
                .phone("0900000000")
                .province("HCM")
                .district("Q1")
                .ward("Ben Nghe")
                .detail("1 Test Street")
                .build();
        Product otherProduct = Product.builder()
                .id(otherProductId)
                .name("Other Store Shirt")
                .storeId(otherStoreId)
                .basePrice(new BigDecimal("100000"))
                .stockQuantity(10)
                .build();
        Product ownProduct = Product.builder()
                .id(ownProductId)
                .name("Own Store Pants")
                .storeId(storeId)
                .basePrice(new BigDecimal("200000"))
                .stockQuantity(7)
                .build();
        OrderRequest request = OrderRequest.builder()
                .addressId(addressId)
                .paymentMethod("COD")
                .items(List.of(
                        OrderRequest.OrderItemRequest.builder()
                                .productId(otherProductId)
                                .quantity(2)
                                .build(),
                        OrderRequest.OrderItemRequest.builder()
                                .productId(ownProductId)
                                .quantity(1)
                                .build()
                ))
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(addressRepository.findById(addressId)).thenReturn(Optional.of(address));
        when(productRepository.findPublicByIdForUpdate(otherProductId)).thenReturn(Optional.of(otherProduct));
        when(productRepository.findPublicByIdForUpdate(ownProductId)).thenReturn(Optional.of(ownProduct));

        ForbiddenException ex = assertThrows(ForbiddenException.class, () -> orderService.create(userId, request));

        assertEquals("Khong the mua san pham tu gian hang cua chinh ban.", ex.getMessage());
        assertEquals(10, otherProduct.getStockQuantity());
        assertEquals(7, ownProduct.getStockQuantity());
        verify(orderRepository, never()).save(any(Order.class));
        verify(productVariantRepository, never()).findByProductIdAndIsActiveTrue(any());
    }

    @Test
    void createRequiresVariantSelectionWhenMultipleActiveVariants() {
        UUID userId = UUID.randomUUID();
        UUID addressId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        User user = User.builder()
                .id(userId)
                .email("buyer@example.com")
                .password("secret")
                .build();

        Address address = Address.builder()
                .id(addressId)
                .user(user)
                .fullName("Buyer")
                .phone("0900000000")
                .province("HCM")
                .district("Q1")
                .ward("Ben Nghe")
                .detail("1 Test Street")
                .build();

        Product product = Product.builder()
                .id(productId)
                .name("Sneaker")
                .storeId(storeId)
                .basePrice(new BigDecimal("500000"))
                .stockQuantity(10)
                .build();
        ProductVariant variantA = ProductVariant.builder()
                .id(UUID.randomUUID())
                .product(product)
                .isActive(true)
                .stockQuantity(3)
                .build();
        ProductVariant variantB = ProductVariant.builder()
                .id(UUID.randomUUID())
                .product(product)
                .isActive(true)
                .stockQuantity(7)
                .build();

        OrderRequest request = OrderRequest.builder()
                .addressId(addressId)
                .paymentMethod("COD")
                .items(List.of(
                        OrderRequest.OrderItemRequest.builder()
                                .productId(productId)
                                .quantity(1)
                                .build()
                ))
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(addressRepository.findById(addressId)).thenReturn(Optional.of(address));
        when(productRepository.findPublicByIdForUpdate(productId)).thenReturn(Optional.of(product));
        when(productVariantRepository.findByProductIdAndIsActiveTrue(productId)).thenReturn(List.of(variantA, variantB));

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> orderService.create(userId, request)
        );

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Please select a product variant", ex.getReason());
    }

    @Test
    void adminCancelDeliveredOrderTriggersVendorRefundDebit() {
        Order order = buildStoreOrder(Order.OrderStatus.DELIVERED);
        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order updated = orderService.updateStatus(orderId, Order.OrderStatus.CANCELLED);

        assertEquals(Order.OrderStatus.CANCELLED, updated.getStatus());
        assertEquals(1, walletService.getDebitCallCount());
        assertEquals(updated.getId(), walletService.getLastDebitedOrderId());
    }

    @Test
    void vendorDeliveringOrderSnapshotsDeliveredAtAndCreditsEscrow() {
        Order order = buildStoreOrder(Order.OrderStatus.SHIPPED);
        order.setTrackingNumber("TRACK-001");
        order.setShippingCarrier("GHN");
        when(orderRepository.findByIdAndStoreId(orderId, storeId)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order updated = orderService.updateStatusForStore(orderId, storeId, Order.OrderStatus.DELIVERED, null, null, null);

        assertEquals(Order.OrderStatus.DELIVERED, updated.getStatus());
        assertTrue(updated.getDeliveredAt() != null);
        assertEquals(1, walletService.getCreditCallCount());
        assertEquals(updated.getId(), walletService.getLastCreditedOrderId());
    }

    @Test
    void adminCancelParentOrderCascadesToAllChildrenIncludingDelivered() {
        UUID parentId = UUID.randomUUID();
        Order parent = Order.builder()
                .id(parentId)
                .status(Order.OrderStatus.PROCESSING)
                .subtotal(new BigDecimal("200000"))
                .shippingFee(new BigDecimal("30000"))
                .discount(BigDecimal.ZERO)
                .total(new BigDecimal("230000"))
                .paymentMethod(Order.PaymentMethod.COD)
                .paymentStatus(Order.PaymentStatus.UNPAID)
                .build();

        Order subOrderA = buildStoreOrder(Order.OrderStatus.CONFIRMED);
        subOrderA.setId(UUID.randomUUID());
        subOrderA.setParentOrder(parent);
        subOrderA.setPaymentMethod(Order.PaymentMethod.COD);
        subOrderA.setPaymentStatus(Order.PaymentStatus.UNPAID);

        Order subOrderB = buildStoreOrder(Order.OrderStatus.DELIVERED);
        subOrderB.setId(UUID.randomUUID());
        subOrderB.setParentOrder(parent);
        subOrderB.setPaymentMethod(Order.PaymentMethod.COD);
        subOrderB.setPaymentStatus(Order.PaymentStatus.PAID);

        when(orderRepository.findById(parentId)).thenReturn(Optional.of(parent));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(orderRepository.findByParentOrderOrderByCreatedAtDesc(parent)).thenReturn(List.of(subOrderA, subOrderB));
        when(orderRepository.findByParentOrderIdOrderByCreatedAtDesc(parentId)).thenReturn(List.of(subOrderA, subOrderB));

        Order updated = orderService.updateStatus(parentId, Order.OrderStatus.CANCELLED);

        assertEquals(Order.OrderStatus.CANCELLED, updated.getStatus());
        assertEquals(Order.OrderStatus.CANCELLED, subOrderA.getStatus());
        assertEquals(Order.OrderStatus.CANCELLED, subOrderB.getStatus());
    }

    @Test
    void cancelPreShipmentOrderRestoresReservedStock() {
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();

        Product product = Product.builder()
                .id(productId)
                .storeId(storeId)
                .stockQuantity(3)
                .build();
        ProductVariant variant = ProductVariant.builder()
                .id(variantId)
                .product(product)
                .isActive(true)
                .stockQuantity(3)
                .build();

        Order order = buildStoreOrder(Order.OrderStatus.CONFIRMED);
        OrderItem item = OrderItem.builder()
                .id(UUID.randomUUID())
                .order(order)
                .product(product)
                .variant(variant)
                .quantity(2)
                .unitPrice(new BigDecimal("50000"))
                .totalPrice(new BigDecimal("100000"))
                .storeId(storeId)
                .build();
        order.setItems(new ArrayList<>(List.of(item)));

        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(productVariantRepository.findByIdForUpdate(variantId)).thenReturn(Optional.of(variant));
        when(productRepository.findByIdForUpdate(productId)).thenReturn(Optional.of(product));
        when(productVariantRepository.sumActiveStockByProductId(productId)).thenReturn(5L);

        Order updated = orderService.updateStatus(orderId, Order.OrderStatus.CANCELLED);

        assertEquals(Order.OrderStatus.CANCELLED, updated.getStatus());
        assertEquals(5, variant.getStockQuantity());
        assertEquals(5, product.getStockQuantity());
    }

    @Test
    void autoCancelExpiredVendorConfirmationsSkipsOrdersBeforeDeadline() {
        LocalDateTime now = LocalDateTime.of(2026, 5, 20, 10, 0);

        when(orderRepository.findVendorConfirmationDeadlineBreaches(
                eq(now),
                eq(now.minusDays(3)),
                any(Pageable.class)
        )).thenReturn(List.of());

        int cancelled = orderService.autoCancelExpiredVendorConfirmations(now, 50);

        assertEquals(0, cancelled);
        verify(orderRepository, never()).findByIdForUpdate(any());
    }

    @Test
    void autoCancelExpiredVendorConfirmationsCancelsAndRestoresStock() {
        LocalDateTime now = LocalDateTime.of(2026, 5, 20, 10, 0);
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();

        Product product = Product.builder()
                .id(productId)
                .storeId(storeId)
                .stockQuantity(3)
                .build();
        ProductVariant variant = ProductVariant.builder()
                .id(variantId)
                .product(product)
                .isActive(true)
                .stockQuantity(3)
                .build();
        Order order = buildStoreOrder(Order.OrderStatus.WAITING_FOR_VENDOR);
        order.setCreatedAt(now.minusDays(4));
        order.setVendorConfirmationDeadlineAt(now.minusMinutes(1));
        OrderItem item = OrderItem.builder()
                .id(UUID.randomUUID())
                .order(order)
                .product(product)
                .variant(variant)
                .quantity(2)
                .unitPrice(new BigDecimal("50000"))
                .totalPrice(new BigDecimal("100000"))
                .storeId(storeId)
                .build();
        order.setItems(new ArrayList<>(List.of(item)));

        when(orderRepository.findVendorConfirmationDeadlineBreaches(eq(now), eq(now.minusDays(3)), any(Pageable.class)))
                .thenReturn(List.of(order));
        when(orderRepository.findByIdForUpdate(orderId)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(productVariantRepository.findByIdForUpdate(variantId)).thenReturn(Optional.of(variant));
        when(productRepository.findByIdForUpdate(productId)).thenReturn(Optional.of(product));
        when(productVariantRepository.sumActiveStockByProductId(productId)).thenReturn(5L);

        int cancelled = orderService.autoCancelExpiredVendorConfirmations(now, 50);

        assertEquals(1, cancelled);
        assertEquals(Order.OrderStatus.CANCELLED, order.getStatus());
        assertEquals(5, variant.getStockQuantity());
        assertEquals(5, product.getStockQuantity());
        assertNull(order.getVendorConfirmationDeadlineAt());

        ArgumentCaptor<OrderStatusLog> logCaptor = forClass(OrderStatusLog.class);
        verify(orderStatusLogRepository, times(2)).save(logCaptor.capture());
        assertTrue(logCaptor.getAllValues().stream()
                .anyMatch(log -> "SLA_AUTO_CANCELLED".equals(log.getEventType())));
    }

    @Test
    void autoCancelExpiredVendorConfirmationsIgnoresConfirmedOrders() {
        LocalDateTime now = LocalDateTime.of(2026, 5, 20, 10, 0);
        Order order = buildStoreOrder(Order.OrderStatus.CONFIRMED);
        order.setCreatedAt(now.minusDays(5));
        order.setVendorConfirmationDeadlineAt(now.minusDays(2));

        when(orderRepository.findVendorConfirmationDeadlineBreaches(eq(now), eq(now.minusDays(3)), any(Pageable.class)))
                .thenReturn(List.of(order));
        when(orderRepository.findByIdForUpdate(orderId)).thenReturn(Optional.of(order));

        int cancelled = orderService.autoCancelExpiredVendorConfirmations(now, 50);

        assertEquals(0, cancelled);
        assertEquals(Order.OrderStatus.CONFIRMED, order.getStatus());
        verify(orderRepository, never()).save(any(Order.class));
    }

    @Test
    void autoCancelExpiredVendorConfirmationsMarksPaidOnlineOrderRefundPending() {
        LocalDateTime now = LocalDateTime.of(2026, 5, 20, 10, 0);
        Order order = buildStoreOrder(Order.OrderStatus.WAITING_FOR_VENDOR);
        order.setCreatedAt(now.minusDays(4));
        order.setVendorConfirmationDeadlineAt(now.minusMinutes(1));
        order.setPaymentMethod(Order.PaymentMethod.MOMO);
        order.setPaymentStatus(Order.PaymentStatus.PAID);

        when(orderRepository.findVendorConfirmationDeadlineBreaches(eq(now), eq(now.minusDays(3)), any(Pageable.class)))
                .thenReturn(List.of(order));
        when(orderRepository.findByIdForUpdate(orderId)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        int cancelled = orderService.autoCancelExpiredVendorConfirmations(now, 50);

        assertEquals(1, cancelled);
        assertEquals(Order.OrderStatus.CANCELLED, order.getStatus());
        assertEquals(Order.PaymentStatus.REFUND_PENDING, order.getPaymentStatus());
    }

    @Test
    void autoCancelExpiredVendorConfirmationsCancelsLegacySingleOrderWithoutStoreId() {
        LocalDateTime now = LocalDateTime.of(2026, 5, 20, 10, 0);
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();

        Product product = Product.builder()
                .id(productId)
                .storeId(storeId)
                .stockQuantity(1)
                .build();
        ProductVariant variant = ProductVariant.builder()
                .id(variantId)
                .product(product)
                .isActive(true)
                .stockQuantity(1)
                .build();
        Order order = buildStoreOrder(Order.OrderStatus.WAITING_FOR_VENDOR);
        order.setStoreId(null);
        order.setCreatedAt(now.minusDays(4));
        order.setVendorConfirmationDeadlineAt(now.minusMinutes(1));
        order.setSubOrders(new ArrayList<>());
        OrderItem item = OrderItem.builder()
                .id(UUID.randomUUID())
                .order(order)
                .product(product)
                .variant(variant)
                .quantity(1)
                .unitPrice(new BigDecimal("50000"))
                .totalPrice(new BigDecimal("50000"))
                .storeId(storeId)
                .build();
        order.setItems(new ArrayList<>(List.of(item)));

        when(orderRepository.findVendorConfirmationDeadlineBreaches(eq(now), eq(now.minusDays(3)), any(Pageable.class)))
                .thenReturn(List.of(order));
        when(orderRepository.findByIdForUpdate(orderId)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(orderRepository.findByParentOrderOrderByCreatedAtDesc(order)).thenReturn(List.of());
        when(productVariantRepository.findByIdForUpdate(variantId)).thenReturn(Optional.of(variant));
        when(productRepository.findByIdForUpdate(productId)).thenReturn(Optional.of(product));
        when(productVariantRepository.sumActiveStockByProductId(productId)).thenReturn(2L);

        int cancelled = orderService.autoCancelExpiredVendorConfirmations(now, 50);

        assertEquals(1, cancelled);
        assertEquals(Order.OrderStatus.CANCELLED, order.getStatus());
        assertEquals(2, variant.getStockQuantity());
        assertEquals(2, product.getStockQuantity());
    }

    @Test
    void findByUserIdReconcilesExpiredVendorConfirmationsBeforeReturningOrders() {
        UUID userId = UUID.randomUUID();
        Order order = buildStoreOrder(Order.OrderStatus.WAITING_FOR_VENDOR);
        order.setCreatedAt(LocalDateTime.now().minusDays(4));
        order.setVendorConfirmationDeadlineAt(LocalDateTime.now().minusDays(1));

        when(orderRepository.findVendorConfirmationDeadlineBreaches(
                any(LocalDateTime.class),
                any(LocalDateTime.class),
                any(Pageable.class)
        )).thenReturn(List.of(order));
        when(orderRepository.findByIdForUpdate(orderId)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(orderRepository.findByUserIdAndParentOrderIsNullOrderByCreatedAtDesc(userId)).thenReturn(List.of(order));
        when(storeRepository.findById(storeId)).thenReturn(Optional.empty());

        List<AdminOrderResponse> orders = orderService.findByUserId(userId);

        assertEquals(1, orders.size());
        assertEquals(Order.OrderStatus.CANCELLED, orders.get(0).getStatus());
        assertEquals(Order.OrderStatus.CANCELLED, order.getStatus());
    }

    @Test
    void autoCancelExpiredVendorConfirmationsSyncsParentWhenOneSubOrderCancelled() {
        LocalDateTime now = LocalDateTime.of(2026, 5, 20, 10, 0);
        UUID parentId = UUID.randomUUID();
        UUID subOrderId = UUID.randomUUID();

        Order parent = Order.builder()
                .id(parentId)
                .status(Order.OrderStatus.WAITING_FOR_VENDOR)
                .paymentMethod(Order.PaymentMethod.COD)
                .paymentStatus(Order.PaymentStatus.UNPAID)
                .build();
        Order expiredSubOrder = buildStoreOrder(Order.OrderStatus.WAITING_FOR_VENDOR);
        expiredSubOrder.setId(subOrderId);
        expiredSubOrder.setParentOrder(parent);
        expiredSubOrder.setCreatedAt(now.minusDays(4));
        expiredSubOrder.setVendorConfirmationDeadlineAt(now.minusMinutes(1));

        Order waitingSubOrder = buildStoreOrder(Order.OrderStatus.WAITING_FOR_VENDOR);
        waitingSubOrder.setId(UUID.randomUUID());
        waitingSubOrder.setParentOrder(parent);
        waitingSubOrder.setVendorConfirmationDeadlineAt(now.plusDays(1));

        when(orderRepository.findVendorConfirmationDeadlineBreaches(eq(now), eq(now.minusDays(3)), any(Pageable.class)))
                .thenReturn(List.of(expiredSubOrder));
        when(orderRepository.findByIdForUpdate(subOrderId)).thenReturn(Optional.of(expiredSubOrder));
        when(orderRepository.findById(parentId)).thenReturn(Optional.of(parent));
        when(orderRepository.findByParentOrderIdOrderByCreatedAtDesc(parentId))
                .thenReturn(List.of(expiredSubOrder, waitingSubOrder));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        int cancelled = orderService.autoCancelExpiredVendorConfirmations(now, 50);

        assertEquals(1, cancelled);
        assertEquals(Order.OrderStatus.CANCELLED, expiredSubOrder.getStatus());
        assertEquals(Order.OrderStatus.WAITING_FOR_VENDOR, waitingSubOrder.getStatus());
        assertEquals(Order.OrderStatus.WAITING_FOR_VENDOR, parent.getStatus());
    }

    @Test
    void autoCancelExpiredVendorConfirmationsCancelsParentWhenAllSubOrdersExpired() {
        LocalDateTime now = LocalDateTime.of(2026, 5, 20, 10, 0);
        UUID parentId = UUID.randomUUID();
        UUID firstSubOrderId = UUID.randomUUID();
        UUID secondSubOrderId = UUID.randomUUID();

        Order parent = Order.builder()
                .id(parentId)
                .status(Order.OrderStatus.WAITING_FOR_VENDOR)
                .paymentMethod(Order.PaymentMethod.COD)
                .paymentStatus(Order.PaymentStatus.UNPAID)
                .build();
        Order firstSubOrder = buildStoreOrder(Order.OrderStatus.WAITING_FOR_VENDOR);
        firstSubOrder.setId(firstSubOrderId);
        firstSubOrder.setParentOrder(parent);
        firstSubOrder.setCreatedAt(now.minusDays(4));
        firstSubOrder.setVendorConfirmationDeadlineAt(now.minusMinutes(2));

        Order secondSubOrder = buildStoreOrder(Order.OrderStatus.WAITING_FOR_VENDOR);
        secondSubOrder.setId(secondSubOrderId);
        secondSubOrder.setParentOrder(parent);
        secondSubOrder.setCreatedAt(now.minusDays(4));
        secondSubOrder.setVendorConfirmationDeadlineAt(now.minusMinutes(1));

        when(orderRepository.findVendorConfirmationDeadlineBreaches(eq(now), eq(now.minusDays(3)), any(Pageable.class)))
                .thenReturn(List.of(firstSubOrder, secondSubOrder));
        when(orderRepository.findByIdForUpdate(firstSubOrderId)).thenReturn(Optional.of(firstSubOrder));
        when(orderRepository.findByIdForUpdate(secondSubOrderId)).thenReturn(Optional.of(secondSubOrder));
        when(orderRepository.findById(parentId)).thenReturn(Optional.of(parent));
        when(orderRepository.findByParentOrderIdOrderByCreatedAtDesc(parentId))
                .thenReturn(List.of(firstSubOrder, secondSubOrder));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        int cancelled = orderService.autoCancelExpiredVendorConfirmations(now, 50);

        assertEquals(2, cancelled);
        assertEquals(Order.OrderStatus.CANCELLED, firstSubOrder.getStatus());
        assertEquals(Order.OrderStatus.CANCELLED, secondSubOrder.getStatus());
        assertEquals(Order.OrderStatus.CANCELLED, parent.getStatus());
        assertEquals(Order.PaymentStatus.FAILED, parent.getPaymentStatus());
    }

    @Test
    void cancelShippedOrderDoesNotRestoreStock() {
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();

        Product product = Product.builder()
                .id(productId)
                .storeId(storeId)
                .stockQuantity(3)
                .build();
        ProductVariant variant = ProductVariant.builder()
                .id(variantId)
                .product(product)
                .isActive(true)
                .stockQuantity(3)
                .build();

        Order order = buildStoreOrder(Order.OrderStatus.SHIPPED);
        OrderItem item = OrderItem.builder()
                .id(UUID.randomUUID())
                .order(order)
                .product(product)
                .variant(variant)
                .quantity(2)
                .unitPrice(new BigDecimal("50000"))
                .totalPrice(new BigDecimal("100000"))
                .storeId(storeId)
                .build();
        order.setItems(List.of(item));

        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order updated = orderService.updateStatus(orderId, Order.OrderStatus.CANCELLED);

        assertEquals(Order.OrderStatus.CANCELLED, updated.getStatus());
        assertEquals(3, variant.getStockQuantity());
        assertEquals(3, product.getStockQuantity());
        verify(productVariantRepository, never()).findByIdForUpdate(eq(variantId));
        verify(productRepository, never()).findByIdForUpdate(eq(productId));
    }

    @Test
    void createCodOrderConsumesDiscountUsageImmediately() {
        UUID userId = UUID.randomUUID();
        UUID addressId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();

        User user = User.builder()
                .id(userId)
                .email("buyer@example.com")
                .password("secret")
                .build();
        Address address = Address.builder()
                .id(addressId)
                .user(user)
                .fullName("Buyer")
                .phone("0900000000")
                .province("HCM")
                .district("Q1")
                .ward("Ben Nghe")
                .detail("1 Test Street")
                .build();
        Product product = Product.builder()
                .id(productId)
                .name("T-Shirt")
                .storeId(storeId)
                .basePrice(new BigDecimal("100000"))
                .salePrice(new BigDecimal("80000"))
                .stockQuantity(5)
                .build();
        ProductVariant variant = ProductVariant.builder()
                .id(variantId)
                .product(product)
                .sku("TS-RED-M")
                .isActive(true)
                .stockQuantity(5)
                .priceAdjustment(BigDecimal.ZERO)
                .build();
        Store store = Store.builder()
                .id(storeId)
                .name("Store A")
                .commissionRate(new BigDecimal("10.0"))
                .build();
        Coupon coupon = Coupon.builder()
                .code("SAVE10")
                .discountType(Coupon.DiscountType.PERCENT)
                .discountValue(10.0)
                .minOrderAmount(0.0)
                .maxUses(100)
                .usedCount(0)
                .isActive(true)
                .build();
        OrderRequest request = OrderRequest.builder()
                .addressId(addressId)
                .paymentMethod("COD")
                .couponCode("save10")
                .items(List.of(
                        OrderRequest.OrderItemRequest.builder()
                                .productId(productId)
                                .variantId(variantId)
                                .quantity(1)
                                .build()
                ))
                .build();

        final Order[] persisted = new Order[1];
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(addressRepository.findById(addressId)).thenReturn(Optional.of(address));
        when(productRepository.findPublicByIdForUpdate(productId)).thenReturn(Optional.of(product));
        when(productVariantRepository.findByIdForUpdate(variantId)).thenReturn(Optional.of(variant));
        when(productVariantRepository.sumActiveStockByProductId(productId)).thenReturn(4L);
        when(storeRepository.findById(storeId)).thenReturn(Optional.of(store));
        when(couponRepository.findByCode("SAVE10")).thenReturn(Optional.of(coupon));
        when(couponRepository.findByCodeForUpdate("SAVE10")).thenReturn(Optional.of(coupon));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> {
            Order saved = invocation.getArgument(0);
            if (saved.getId() == null) {
                saved.setId(orderId);
            }
            persisted[0] = saved;
            return saved;
        });
        when(orderRepository.findByIdForUpdate(orderId)).thenAnswer(invocation -> Optional.ofNullable(persisted[0]));

        orderService.create(userId, request);

        assertEquals(1, coupon.getUsedCount());
        assertTrue(Boolean.TRUE.equals(persisted[0].getDiscountUsageConsumed()));
    }

    @Test
    void onlineOrderConsumesDiscountOnlyAfterPaidAndOnlyOnce() {
        UUID userId = UUID.randomUUID();
        UUID addressId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();

        User user = User.builder()
                .id(userId)
                .email("buyer@example.com")
                .password("secret")
                .build();
        Address address = Address.builder()
                .id(addressId)
                .user(user)
                .fullName("Buyer")
                .phone("0900000000")
                .province("HCM")
                .district("Q1")
                .ward("Ben Nghe")
                .detail("1 Test Street")
                .build();
        Product product = Product.builder()
                .id(productId)
                .name("T-Shirt")
                .storeId(storeId)
                .basePrice(new BigDecimal("100000"))
                .salePrice(new BigDecimal("80000"))
                .stockQuantity(5)
                .build();
        ProductVariant variant = ProductVariant.builder()
                .id(variantId)
                .product(product)
                .sku("TS-RED-M")
                .isActive(true)
                .stockQuantity(5)
                .priceAdjustment(BigDecimal.ZERO)
                .build();
        Store store = Store.builder()
                .id(storeId)
                .name("Store A")
                .commissionRate(new BigDecimal("10.0"))
                .build();
        Coupon coupon = Coupon.builder()
                .code("SAVE10")
                .discountType(Coupon.DiscountType.PERCENT)
                .discountValue(10.0)
                .minOrderAmount(0.0)
                .maxUses(100)
                .usedCount(0)
                .isActive(true)
                .build();
        OrderRequest request = OrderRequest.builder()
                .addressId(addressId)
                .paymentMethod("VNPAY")
                .couponCode("SAVE10")
                .items(List.of(
                        OrderRequest.OrderItemRequest.builder()
                                .productId(productId)
                                .variantId(variantId)
                                .quantity(1)
                                .build()
                ))
                .build();

        final Order[] persisted = new Order[1];
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(addressRepository.findById(addressId)).thenReturn(Optional.of(address));
        when(productRepository.findPublicByIdForUpdate(productId)).thenReturn(Optional.of(product));
        when(productVariantRepository.findByIdForUpdate(variantId)).thenReturn(Optional.of(variant));
        when(productVariantRepository.sumActiveStockByProductId(productId)).thenReturn(4L);
        when(storeRepository.findById(storeId)).thenReturn(Optional.of(store));
        when(couponRepository.findByCode("SAVE10")).thenReturn(Optional.of(coupon));
        when(couponRepository.findByCodeForUpdate("SAVE10")).thenReturn(Optional.of(coupon));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> {
            Order saved = invocation.getArgument(0);
            if (saved.getId() == null) {
                saved.setId(orderId);
            }
            persisted[0] = saved;
            return saved;
        });
        when(orderRepository.findById(orderId)).thenAnswer(invocation -> Optional.ofNullable(persisted[0]));
        when(orderRepository.findByIdForUpdate(orderId)).thenAnswer(invocation -> Optional.ofNullable(persisted[0]));

        orderService.create(userId, request);
        assertEquals(0, coupon.getUsedCount());

        orderService.markOrderPaid(orderId);
        assertEquals(1, coupon.getUsedCount());

        orderService.markOrderPaid(orderId);
        assertEquals(1, coupon.getUsedCount());
        assertTrue(Boolean.TRUE.equals(persisted[0].getDiscountUsageConsumed()));
    }

    @Test
    void markOrderPaidFailsWhenCouponUsageQuotaReachedAtConsumeTime() {
        UUID id = UUID.randomUUID();

        Order order = Order.builder()
                .id(id)
                .status(Order.OrderStatus.WAITING_FOR_VENDOR)
                .paymentMethod(Order.PaymentMethod.VNPAY)
                .paymentStatus(Order.PaymentStatus.UNPAID)
                .couponCode("SAVE10")
                .discount(new BigDecimal("10000"))
                .subtotal(new BigDecimal("100000"))
                .shippingFee(BigDecimal.ZERO)
                .total(new BigDecimal("90000"))
                .build();
        Coupon coupon = Coupon.builder()
                .code("SAVE10")
                .maxUses(1)
                .usedCount(1)
                .isActive(true)
                .build();

        when(orderRepository.findById(id)).thenReturn(Optional.of(order));
        when(orderRepository.findByIdForUpdate(id)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(couponRepository.findByCodeForUpdate("SAVE10")).thenReturn(Optional.of(coupon));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> orderService.markOrderPaid(id));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertEquals("Coupon usage limit has been reached", ex.getReason());
        assertEquals(1, safeInt(coupon.getUsedCount()));
        assertTrue(!Boolean.TRUE.equals(order.getDiscountUsageConsumed()));
    }

    @Test
    void markOrderPaidFailsWhenVoucherUsageQuotaReachedAtConsumeTime() {
        UUID id = UUID.randomUUID();
        UUID localStoreId = UUID.randomUUID();

        Order order = Order.builder()
                .id(id)
                .storeId(localStoreId)
                .status(Order.OrderStatus.WAITING_FOR_VENDOR)
                .paymentMethod(Order.PaymentMethod.VNPAY)
                .paymentStatus(Order.PaymentStatus.UNPAID)
                .couponCode("VOUCH10")
                .discount(new BigDecimal("10000"))
                .subtotal(new BigDecimal("100000"))
                .shippingFee(BigDecimal.ZERO)
                .total(new BigDecimal("90000"))
                .build();
        Voucher voucher = Voucher.builder()
                .storeId(localStoreId)
                .code("VOUCH10")
                .totalIssued(1)
                .usedCount(1)
                .status(Voucher.VoucherStatus.RUNNING)
                .build();

        when(orderRepository.findById(id)).thenReturn(Optional.of(order));
        when(orderRepository.findByIdForUpdate(id)).thenReturn(Optional.of(order));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(voucherRepository.findByCodeAndStoreIdsForUpdate(eq("VOUCH10"), any())).thenReturn(List.of(voucher));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> orderService.markOrderPaid(id));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertEquals("Voucher usage limit has been reached", ex.getReason());
        assertEquals(1, safeInt(voucher.getUsedCount()));
        assertTrue(!Boolean.TRUE.equals(order.getDiscountUsageConsumed()));
    }

    @Test
    void createCodOrderConsumesCustomerVoucherFromWallet() {
        UUID userId = UUID.randomUUID();
        UUID addressId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        UUID customerVoucherId = UUID.randomUUID();
        UUID voucherId = UUID.randomUUID();

        User user = User.builder()
                .id(userId)
                .email("buyer@example.com")
                .password("secret")
                .role(User.Role.CUSTOMER)
                .isActive(true)
                .build();
        Address address = Address.builder()
                .id(addressId)
                .user(user)
                .fullName("Buyer")
                .phone("0900000000")
                .province("HCM")
                .district("Q1")
                .ward("Ben Nghe")
                .detail("1 Test Street")
                .build();
        Product product = Product.builder()
                .id(productId)
                .name("T-Shirt")
                .storeId(storeId)
                .basePrice(new BigDecimal("100000"))
                .salePrice(new BigDecimal("80000"))
                .stockQuantity(5)
                .build();
        ProductVariant variant = ProductVariant.builder()
                .id(variantId)
                .product(product)
                .sku("TS-RED-M")
                .isActive(true)
                .stockQuantity(5)
                .priceAdjustment(BigDecimal.ZERO)
                .build();
        Store store = Store.builder()
                .id(storeId)
                .name("Store A")
                .commissionRate(new BigDecimal("10.0"))
                .build();
        Voucher voucher = Voucher.builder()
                .id(voucherId)
                .storeId(storeId)
                .code("WALLET10")
                .name("Wallet Voucher")
                .discountType(Voucher.DiscountType.PERCENT)
                .discountValue(new BigDecimal("10"))
                .minOrderValue(BigDecimal.ZERO)
                .totalIssued(100)
                .usedCount(0)
                .startDate(LocalDate.now().minusDays(1))
                .endDate(LocalDate.now().plusDays(5))
                .status(Voucher.VoucherStatus.RUNNING)
                .build();
        CustomerVoucher walletVoucher = CustomerVoucher.builder()
                .id(customerVoucherId)
                .user(user)
                .voucher(voucher)
                .walletStatus(CustomerVoucher.WalletStatus.AVAILABLE)
                .claimSource(CustomerVoucher.ClaimSource.STORE_CLAIM)
                .build();
        OrderRequest request = OrderRequest.builder()
                .addressId(addressId)
                .paymentMethod("COD")
                .customerVoucherId(customerVoucherId)
                .items(List.of(
                        OrderRequest.OrderItemRequest.builder()
                                .productId(productId)
                                .variantId(variantId)
                                .quantity(1)
                                .build()
                ))
                .build();

        final Order[] persisted = new Order[1];
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(addressRepository.findById(addressId)).thenReturn(Optional.of(address));
        when(productRepository.findPublicByIdForUpdate(productId)).thenReturn(Optional.of(product));
        when(productVariantRepository.findByIdForUpdate(variantId)).thenReturn(Optional.of(variant));
        when(productVariantRepository.sumActiveStockByProductId(productId)).thenReturn(4L);
        when(storeRepository.findById(storeId)).thenReturn(Optional.of(store));
        when(customerVoucherRepository.findByIdAndUserIdForUpdate(customerVoucherId, userId))
                .thenReturn(Optional.of(walletVoucher));
        when(voucherRepository.findByIdForUpdate(voucherId)).thenReturn(Optional.of(voucher));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> {
            Order saved = invocation.getArgument(0);
            if (saved.getId() == null) {
                saved.setId(orderId);
            }
            persisted[0] = saved;
            return saved;
        });
        when(orderRepository.findByIdForUpdate(orderId)).thenAnswer(invocation -> Optional.ofNullable(persisted[0]));

        orderService.create(userId, request);

        assertEquals(1, safeInt(voucher.getUsedCount()));
        assertEquals(CustomerVoucher.WalletStatus.USED, walletVoucher.getWalletStatus());
        assertEquals(orderId, walletVoucher.getUsedOrderId());
        assertTrue(Boolean.TRUE.equals(persisted[0].getDiscountUsageConsumed()));
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : value;
    }

    private Order buildStoreOrder(Order.OrderStatus status) {
        return Order.builder()
                .id(orderId)
                .storeId(storeId)
                .status(status)
                .subtotal(new BigDecimal("100000"))
                .shippingFee(new BigDecimal("20000"))
                .discount(new BigDecimal("0"))
                .total(new BigDecimal("120000"))
                .paymentMethod(Order.PaymentMethod.COD)
                .paymentStatus(Order.PaymentStatus.UNPAID)
                .build();
    }

    private static final class RecordingWalletService extends WalletService {
        private int debitCallCount = 0;
        private int creditCallCount = 0;
        private UUID lastDebitedOrderId;
        private UUID lastCreditedOrderId;

        private RecordingWalletService() {
            super(null, null, null, null, null, null, null);
        }

        @Override
        public void debitVendorForRefund(Order order) {
            debitCallCount++;
            lastDebitedOrderId = order == null ? null : order.getId();
        }

        @Override
        public void creditEscrowForCompletedOrder(Order order) {
            creditCallCount++;
            lastCreditedOrderId = order == null ? null : order.getId();
        }

        private int getDebitCallCount() {
            return debitCallCount;
        }

        private UUID getLastDebitedOrderId() {
            return lastDebitedOrderId;
        }

        private int getCreditCallCount() {
            return creditCallCount;
        }

        private UUID getLastCreditedOrderId() {
            return lastCreditedOrderId;
        }
    }

    private static final class FixedPublicCodeService extends PublicCodeService {
        private final Queue<String> orderCodes = new ArrayDeque<>();

        private FixedPublicCodeService() {
            super(null, null, null, null);
        }

        private void pushOrderCode(String code) {
            orderCodes.add(code);
        }

        @Override
        public String nextOrderCode() {
            String code = orderCodes.poll();
            return code != null ? code : "DH-TEST-000001";
        }
    }

    private static final class NoopNotificationDomainService extends NotificationDomainService {
        private NoopNotificationDomainService() {
            super(null, null, null);
        }

        @Override
        public NotificationResponse createAndPush(
                UUID userId,
                Notification.NotificationType type,
                String title,
                String message,
                String link
        ) {
            return null;
        }
    }
}
