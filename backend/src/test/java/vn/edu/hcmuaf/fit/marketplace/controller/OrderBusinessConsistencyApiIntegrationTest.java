package vn.edu.hcmuaf.fit.marketplace.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import vn.edu.hcmuaf.fit.marketplace.entity.Address;
import vn.edu.hcmuaf.fit.marketplace.entity.Coupon;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.OrderItem;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductVariant;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.entity.CustomerWalletTransaction;
import vn.edu.hcmuaf.fit.marketplace.entity.VendorWallet;
import vn.edu.hcmuaf.fit.marketplace.entity.WalletTransaction;
import vn.edu.hcmuaf.fit.marketplace.repository.AddressRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.CustomerWalletTransactionRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.CouponRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductVariantRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.VendorWalletRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.WalletTransactionRepository;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderBusinessConsistencyApiIntegrationTest {

        private static final String TEST_PASSWORD = "Test@123";
        private static final String ADMIN_EMAIL = "admin@fashion.local";
        private static final String VENDOR_EMAIL = "an.shop@fashion.local";
        private static final String CUSTOMER_EMAIL = "minh.customer@fashion.local";

        @Autowired
        private TestRestTemplate restTemplate;

        @Autowired
        private ObjectMapper objectMapper;

        @Autowired
        private UserRepository userRepository;

        @Autowired
        private StoreRepository storeRepository;

        @Autowired
        private AddressRepository addressRepository;

        @Autowired
        private OrderRepository orderRepository;

        @Autowired
        private ProductRepository productRepository;

        @Autowired
        private ProductVariantRepository productVariantRepository;

        @Autowired
        private CouponRepository couponRepository;

        @Autowired
        private ReturnRequestRepository returnRequestRepository;

        @Autowired
        private VendorWalletRepository vendorWalletRepository;

        @Autowired
        private WalletTransactionRepository walletTransactionRepository;

        @Autowired
        private CustomerWalletTransactionRepository customerWalletTransactionRepository;

        @LocalServerPort
        private int port;

        private final HttpClient httpClient = HttpClient.newHttpClient();

        @Test
        void adminCancelParentOrderCascadeCancelsDeliveredChildViaApi() throws Exception {
                User customer = getUser(CUSTOMER_EMAIL);
                Address address = getDefaultAddress(customer.getId());
                UUID vendorStoreId = getStoreIdForVendor(VENDOR_EMAIL);

                Order parent = createOrder(customer, address, null, null,
                                Order.OrderStatus.WAITING_FOR_VENDOR,
                                Order.PaymentMethod.MOMO,
                                Order.PaymentStatus.UNPAID,
                                new BigDecimal("200.00"),
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                null);

                Order childA = createOrder(customer, address, vendorStoreId, parent,
                                Order.OrderStatus.WAITING_FOR_VENDOR,
                                Order.PaymentMethod.MOMO,
                                Order.PaymentStatus.UNPAID,
                                new BigDecimal("120.00"),
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                null);

                Order childB = createOrder(customer, address, vendorStoreId, parent,
                                Order.OrderStatus.DELIVERED,
                                Order.PaymentMethod.MOMO,
                                Order.PaymentStatus.PAID,
                                new BigDecimal("80.00"),
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                null);

                String adminToken = loginAndExtractToken(ADMIN_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> response = patchJson(
                                "/api/orders/admin/" + parent.getId() + "/status",
                                adminToken,
                                Map.of("status", "CANCELLED"));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                JsonNode body = objectMapper.readTree(response.getBody());
                assertEquals("CANCELLED", body.path("status").asText());

                Order reloadedChildA = orderRepository.findById(childA.getId()).orElseThrow();
                Order reloadedChildB = orderRepository.findById(childB.getId()).orElseThrow();

                assertEquals(Order.OrderStatus.CANCELLED, reloadedChildA.getStatus());
                assertEquals(Order.OrderStatus.CANCELLED, reloadedChildB.getStatus());
        }

        @Test
        void customerCancelPreShipmentRestoresReservedStockViaApi() throws Exception {
                User customer = getUser(CUSTOMER_EMAIL);
                Address address = getDefaultAddress(customer.getId());
                UUID vendorStoreId = getStoreIdForVendor(VENDOR_EMAIL);

                ProductVariant variant = createProductWithSingleVariant(vendorStoreId, 8, new BigDecimal("100.00"));
                Product product = variant.getProduct();

                Order order = createOrderWithSingleItem(customer, address, vendorStoreId, null,
                                Order.OrderStatus.WAITING_FOR_VENDOR,
                                Order.PaymentMethod.COD,
                                Order.PaymentStatus.UNPAID,
                                new BigDecimal("200.00"),
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                product,
                                variant,
                                2,
                                new BigDecimal("100.00"));

                String customerToken = loginAndExtractToken(CUSTOMER_EMAIL, TEST_PASSWORD);
                ResponseEntity<String> response = patchJson(
                                "/api/orders/" + order.getId() + "/cancel",
                                customerToken,
                                Map.of("reason", "Customer changed mind"));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                JsonNode body = objectMapper.readTree(response.getBody());
                assertEquals("CANCELLED", body.path("status").asText());

                ProductVariant reloadedVariant = productVariantRepository.findById(variant.getId()).orElseThrow();
                Product reloadedProduct = productRepository.findById(product.getId()).orElseThrow();

                assertEquals(10, reloadedVariant.getStockQuantity());
                assertEquals(10, reloadedProduct.getStockQuantity());
        }

        @Test
        void adminCancelShippedOrderDoesNotRestoreStockViaApi() throws Exception {
                User customer = getUser(CUSTOMER_EMAIL);
                Address address = getDefaultAddress(customer.getId());
                UUID vendorStoreId = getStoreIdForVendor(VENDOR_EMAIL);

                ProductVariant variant = createProductWithSingleVariant(vendorStoreId, 8, new BigDecimal("120.00"));
                Product product = variant.getProduct();

                Order shippedOrder = createOrderWithSingleItem(customer, address, vendorStoreId, null,
                                Order.OrderStatus.SHIPPED,
                                Order.PaymentMethod.MOMO,
                                Order.PaymentStatus.PAID,
                                new BigDecimal("240.00"),
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                product,
                                variant,
                                2,
                                new BigDecimal("120.00"));

                String adminToken = loginAndExtractToken(ADMIN_EMAIL, TEST_PASSWORD);
                ResponseEntity<String> response = patchJson(
                                "/api/orders/admin/" + shippedOrder.getId() + "/status",
                                adminToken,
                                Map.of("status", "CANCELLED"));

                assertEquals(HttpStatus.OK, response.getStatusCode());

                ProductVariant reloadedVariant = productVariantRepository.findById(variant.getId()).orElseThrow();
                Product reloadedProduct = productRepository.findById(product.getId()).orElseThrow();

                assertEquals(8, reloadedVariant.getStockQuantity());
                assertEquals(8, reloadedProduct.getStockQuantity());
        }

        @Test
        void adminCancelParentMarketplaceOrderDoesNotDoubleRestockViaApi() throws Exception {
                User customer = getUser(CUSTOMER_EMAIL);
                Address address = getDefaultAddress(customer.getId());
                UUID vendorStoreId = getStoreIdForVendor(VENDOR_EMAIL);

                ProductVariant variant = createProductWithSingleVariant(vendorStoreId, 3, new BigDecimal("90.00"));
                Product product = variant.getProduct();

                Order parent = createOrderWithSingleItem(customer, address, null, null,
                                Order.OrderStatus.WAITING_FOR_VENDOR,
                                Order.PaymentMethod.MOMO,
                                Order.PaymentStatus.UNPAID,
                                new BigDecimal("180.00"),
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                product,
                                variant,
                                2,
                                new BigDecimal("90.00"));

                createOrderWithSingleItem(customer, address, vendorStoreId, parent,
                                Order.OrderStatus.WAITING_FOR_VENDOR,
                                Order.PaymentMethod.MOMO,
                                Order.PaymentStatus.UNPAID,
                                new BigDecimal("180.00"),
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                product,
                                variant,
                                2,
                                new BigDecimal("90.00"));

                String adminToken = loginAndExtractToken(ADMIN_EMAIL, TEST_PASSWORD);
                ResponseEntity<String> response = patchJson(
                                "/api/orders/admin/" + parent.getId() + "/status",
                                adminToken,
                                Map.of("status", "CANCELLED"));

                assertEquals(HttpStatus.OK, response.getStatusCode());

                ProductVariant reloadedVariant = productVariantRepository.findById(variant.getId()).orElseThrow();
                Product reloadedProduct = productRepository.findById(product.getId()).orElseThrow();

                assertEquals(5, reloadedVariant.getStockQuantity());
                assertEquals(5, reloadedProduct.getStockQuantity());
        }

        @Test
        void onlineOrderConsumesDiscountOnlyAfterPaidAndOnlyOnceViaApi() throws Exception {
                User customer = getUser(CUSTOMER_EMAIL);
                Address address = getDefaultAddress(customer.getId());
                UUID vendorStoreId = getStoreIdForVendor(VENDOR_EMAIL);

                ProductVariant variant = createProductWithSingleVariant(vendorStoreId, 20, new BigDecimal("100.00"));
                String couponCode = randomCode("CPN");
                couponRepository.save(Coupon.builder()
                                .code(couponCode)
                                .description("Integration coupon")
                                .discountType(Coupon.DiscountType.FIXED)
                                .discountValue(20.0)
                                .minOrderAmount(0.0)
                                .maxUses(1000)
                                .usedCount(0)
                                .maxUsesPerUser(1000)
                                .startsAt(LocalDateTime.now().minusDays(1))
                                .expiresAt(LocalDateTime.now().plusDays(7))
                                .isActive(true)
                                .build());

                String customerToken = loginAndExtractToken(CUSTOMER_EMAIL, TEST_PASSWORD);

                Map<String, Object> createPayload = Map.of(
                                "addressId", address.getId(),
                                "paymentMethod", "MOMO",
                                "couponCode", couponCode,
                                "items", List.of(Map.of(
                                                "productId", variant.getProduct().getId(),
                                                "variantId", variant.getId(),
                                                "quantity", 1)));

                ResponseEntity<String> createResponse = restTemplate.exchange(
                                "/api/orders",
                                HttpMethod.POST,
                                authorizedJsonEntity(customerToken, createPayload),
                                String.class);

                assertEquals(HttpStatus.OK, createResponse.getStatusCode());
                JsonNode createBody = objectMapper.readTree(createResponse.getBody());
                UUID orderId = UUID.fromString(createBody.path("id").asText());
                assertEquals("UNPAID", createBody.path("paymentStatus").asText());

                Coupon afterCreate = couponRepository.findByCode(couponCode).orElseThrow();
                assertEquals(0, Optional.ofNullable(afterCreate.getUsedCount()).orElse(0));

                String adminToken = loginAndExtractToken(ADMIN_EMAIL, TEST_PASSWORD);
                ResponseEntity<String> firstDelivered = patchJson(
                                "/api/orders/admin/" + orderId + "/status",
                                adminToken,
                                Map.of("status", "DELIVERED"));
                assertEquals(HttpStatus.OK, firstDelivered.getStatusCode());

                Coupon afterPaid = couponRepository.findByCode(couponCode).orElseThrow();
                assertEquals(1, Optional.ofNullable(afterPaid.getUsedCount()).orElse(0));

                Order paidOrder = orderRepository.findById(orderId).orElseThrow();
                assertTrue(Boolean.TRUE.equals(paidOrder.getDiscountUsageConsumed()));

                ResponseEntity<String> secondDelivered = patchJson(
                                "/api/orders/admin/" + orderId + "/status",
                                adminToken,
                                Map.of("status", "DELIVERED"));
                assertEquals(HttpStatus.OK, secondDelivered.getStatusCode());

                Coupon afterSecondPaid = couponRepository.findByCode(couponCode).orElseThrow();
                assertEquals(1, Optional.ofNullable(afterSecondPaid.getUsedCount()).orElse(0));
        }

        @Test
        void onlineOrderFinalizePaymentReturnsConflictWhenCouponQuotaIsExhaustedViaApi() throws Exception {
                User customer = getUser(CUSTOMER_EMAIL);
                Address address = getDefaultAddress(customer.getId());
                UUID vendorStoreId = getStoreIdForVendor(VENDOR_EMAIL);

                ProductVariant variant = createProductWithSingleVariant(vendorStoreId, 20, new BigDecimal("100.00"));
                String couponCode = randomCode("CPN");
                couponRepository.save(Coupon.builder()
                                .code(couponCode)
                                .description("Integration coupon")
                                .discountType(Coupon.DiscountType.FIXED)
                                .discountValue(20.0)
                                .minOrderAmount(0.0)
                                .maxUses(1)
                                .usedCount(0)
                                .maxUsesPerUser(1000)
                                .startsAt(LocalDateTime.now().minusDays(1))
                                .expiresAt(LocalDateTime.now().plusDays(7))
                                .isActive(true)
                                .build());

                String customerToken = loginAndExtractToken(CUSTOMER_EMAIL, TEST_PASSWORD);
                Map<String, Object> createPayload = Map.of(
                                "addressId", address.getId(),
                                "paymentMethod", "MOMO",
                                "couponCode", couponCode,
                                "items", List.of(Map.of(
                                                "productId", variant.getProduct().getId(),
                                                "variantId", variant.getId(),
                                                "quantity", 1)));
                ResponseEntity<String> createResponse = restTemplate.exchange(
                                "/api/orders",
                                HttpMethod.POST,
                                authorizedJsonEntity(customerToken, createPayload),
                                String.class);

                assertEquals(HttpStatus.OK, createResponse.getStatusCode());
                JsonNode createBody = objectMapper.readTree(createResponse.getBody());
                UUID orderId = UUID.fromString(createBody.path("id").asText());
                assertEquals("UNPAID", createBody.path("paymentStatus").asText());

                Coupon consumedByOthers = couponRepository.findByCode(couponCode).orElseThrow();
                consumedByOthers.setUsedCount(1);
                couponRepository.save(consumedByOthers);

                String adminToken = loginAndExtractToken(ADMIN_EMAIL, TEST_PASSWORD);
                ResponseEntity<String> finalizeResponse = patchJson(
                                "/api/orders/admin/" + orderId + "/status",
                                adminToken,
                                Map.of("status", "DELIVERED"));

                assertEquals(HttpStatus.CONFLICT, finalizeResponse.getStatusCode());

                Coupon afterFinalize = couponRepository.findByCode(couponCode).orElseThrow();
                assertEquals(1, Optional.ofNullable(afterFinalize.getUsedCount()).orElse(0));

                Order reloaded = orderRepository.findById(orderId).orElseThrow();
                assertEquals(Order.OrderStatus.PENDING, reloaded.getStatus());
                assertEquals(Order.PaymentStatus.UNPAID, reloaded.getPaymentStatus());
                assertFalse(Boolean.TRUE.equals(reloaded.getDiscountUsageConsumed()));
        }

        @Test
        void vendorReturnListExposesNetPaidRefundAmountViaApi() throws Exception {
                User customer = getUser(CUSTOMER_EMAIL);
                Address address = getDefaultAddress(customer.getId());
                User vendor = getUser(VENDOR_EMAIL);
                Store store = storeRepository.findByOwnerId(vendor.getId()).orElseThrow();

                ProductVariant variant = createProductWithSingleVariant(store.getId(), 10, new BigDecimal("50.00"));
                Product product = variant.getProduct();

                Order discountedOrder = createOrderWithSingleItem(customer, address, store.getId(), null,
                                Order.OrderStatus.DELIVERED,
                                Order.PaymentMethod.MOMO,
                                Order.PaymentStatus.PAID,
                                new BigDecimal("100.00"),
                                BigDecimal.ZERO,
                                new BigDecimal("20.00"),
                                product,
                                variant,
                                2,
                                new BigDecimal("50.00"));

                Order orderWithItems = orderRepository.findByIdWithItems(discountedOrder.getId()).orElseThrow();
                OrderItem orderItem = orderWithItems.getItems().get(0);

                ReturnRequest returnRequest = returnRequestRepository.save(ReturnRequest.builder()
                                .returnCode(randomCode("RT"))
                                .order(orderWithItems)
                                .user(customer)
                                .storeId(store.getId())
                                .reason(ReturnRequest.ReturnReason.OTHER)
                                .resolution(ReturnRequest.ReturnResolution.REFUND)
                                .status(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER)
                                .note("Refund net paid test")
                                .adminFinalized(false)
                                .updatedBy("integration-test")
                                .items(List.of(new ReturnRequest.ReturnItemSnapshot(
                                                orderItem.getId(),
                                                orderItem.getProductName(),
                                                orderItem.getVariantName(),
                                                orderItem.getProductImage(),
                                                null,
                                                1,
                                                orderItem.getUnitPrice())))
                                .build());

                String vendorToken = loginAndExtractToken(VENDOR_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> response = restTemplate.exchange(
                                "/api/returns/my-store?statuses=DELIVERED_TO_SELLER&q=" + returnRequest.getReturnCode()
                                                + "&page=0&size=20",
                                HttpMethod.GET,
                                authorizedJsonEntity(vendorToken, null),
                                String.class);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                JsonNode body = objectMapper.readTree(response.getBody());
                JsonNode content = body.path("content");
                assertTrue(content.isArray());
                assertTrue(content.size() > 0, "Expected at least one return request in filtered result");

                JsonNode found = null;
                for (JsonNode row : content) {
                        if (returnRequest.getId().toString().equals(row.path("id").asText())) {
                                found = row;
                                break;
                        }
                }
                assertNotNull(found, "Expected to find the created return request in vendor list");
                assertEquals("DELIVERED_TO_SELLER", found.path("status").asText());
                BigDecimal refundAmount = new BigDecimal(found.path("refundAmount").asText());
                assertEquals(0, refundAmount.compareTo(new BigDecimal("40.00")));
        }

        @Test
        void vendorConfirmRefundEndpointCompletesAndCreatesWalletTransactionsViaApi() throws Exception {
                User customer = getUser(CUSTOMER_EMAIL);
                Address address = getDefaultAddress(customer.getId());
                User vendor = getUser(VENDOR_EMAIL);
                Store store = storeRepository.findByOwnerId(vendor.getId()).orElseThrow();

                ProductVariant variant = createProductWithSingleVariant(store.getId(), 10, new BigDecimal("50.00"));
                Product product = variant.getProduct();

                Order discountedOrder = createOrderWithSingleItem(customer, address, store.getId(), null,
                                Order.OrderStatus.DELIVERED,
                                Order.PaymentMethod.MOMO,
                                Order.PaymentStatus.PAID,
                                new BigDecimal("100.00"),
                                BigDecimal.ZERO,
                                new BigDecimal("20.00"),
                                product,
                                variant,
                                2,
                                new BigDecimal("50.00"));

                Order orderWithItems = orderRepository.findByIdWithItems(discountedOrder.getId()).orElseThrow();
                OrderItem orderItem = orderWithItems.getItems().get(0);

                VendorWallet vendorWallet = vendorWalletRepository.findByStoreId(store.getId())
                                .orElseGet(() -> VendorWallet.builder().storeId(store.getId()).build());
                vendorWallet.setAvailableBalance(new BigDecimal("1000.00"));
                vendorWallet.setFrozenBalance(BigDecimal.ZERO);
                vendorWalletRepository.save(vendorWallet);

                ReturnRequest returnRequest = returnRequestRepository.save(ReturnRequest.builder()
                                .returnCode(randomCode("RT"))
                                .order(orderWithItems)
                                .user(customer)
                                .storeId(store.getId())
                                .reason(ReturnRequest.ReturnReason.OTHER)
                                .resolution(ReturnRequest.ReturnResolution.REFUND)
                                .status(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER)
                                .note("Confirm refund endpoint happy path")
                                .adminFinalized(false)
                                .updatedBy("integration-test")
                                .items(List.of(new ReturnRequest.ReturnItemSnapshot(
                                                orderItem.getId(),
                                                orderItem.getProductName(),
                                                orderItem.getVariantName(),
                                                orderItem.getProductImage(),
                                                null,
                                                1,
                                                orderItem.getUnitPrice())))
                                .build());

                String vendorToken = loginAndExtractToken(VENDOR_EMAIL, TEST_PASSWORD);
                ResponseEntity<String> response = patchJson(
                                "/api/returns/my-store/" + returnRequest.getId() + "/approve",
                                vendorToken,
                                null);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                JsonNode body = objectMapper.readTree(response.getBody());
                assertEquals("REFUND_SUCCESS", body.path("status").asText());
                assertEquals(0, new BigDecimal(body.path("refundAmount").asText()).compareTo(new BigDecimal("40.00")));

                assertTrue(walletTransactionRepository.existsByReturnRequestIdAndType(
                                returnRequest.getId(),
                                WalletTransaction.TransactionType.RETURN_REFUND_DEBIT));
                assertTrue(customerWalletTransactionRepository.existsByReturnRequestIdAndType(
                                returnRequest.getId(),
                                CustomerWalletTransaction.TransactionType.CREDIT_REFUND));

                Order updatedOrder = orderRepository.findById(discountedOrder.getId()).orElseThrow();
                assertEquals(Order.PaymentStatus.REFUNDED, updatedOrder.getPaymentStatus());
        }

        private User getUser(String email) {
                return userRepository.findByEmail(email)
                                .orElseThrow(() -> new IllegalStateException("Missing test user: " + email));
        }

        private UUID getStoreIdForVendor(String vendorEmail) {
                User vendor = getUser(vendorEmail);
                return storeRepository.findByOwnerId(vendor.getId())
                                .orElseThrow(() -> new IllegalStateException(
                                                "Missing store for vendor: " + vendorEmail))
                                .getId();
        }

        private Address getDefaultAddress(UUID userId) {
                List<Address> addresses = addressRepository.findByUserIdOrderByIsDefaultDesc(userId);
                if (!addresses.isEmpty()) {
                        return addresses.get(0);
                }
                User user = userRepository.findById(userId)
                                .orElseThrow(() -> new IllegalStateException("Missing user " + userId));
                Address created = Address.builder()
                                .user(user)
                                .fullName(user.getName() == null || user.getName().isBlank() ? "Test User"
                                                : user.getName())
                                .phone(user.getPhone() == null || user.getPhone().isBlank() ? "0900000000"
                                                : user.getPhone())
                                .province("TP. Hồ Chí Minh")
                                .district("Quận 1")
                                .ward("Bến Nghé")
                                .detail("1 Test Street")
                                .isDefault(true)
                                .build();
                return addressRepository.save(created);
        }

        private ProductVariant createProductWithSingleVariant(UUID storeId, int stock, BigDecimal basePrice) {
                String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase(Locale.ROOT);

                Product product = productRepository.save(Product.builder()
                                .name("IT Product " + suffix)
                                .slug("it-product-" + suffix.toLowerCase(Locale.ROOT))
                                .sku("IT-P-" + suffix)
                                .stockQuantity(stock)
                                .storeId(storeId)
                                .basePrice(basePrice)
                                .salePrice(basePrice)
                                .status(Product.ProductStatus.ACTIVE)
                                .approvalStatus(Product.ApprovalStatus.APPROVED)
                                .build());

                return productVariantRepository.save(ProductVariant.builder()
                                .product(product)
                                .sku("IT-V-" + suffix)
                                .color("Black")
                                .size("L")
                                .stockQuantity(stock)
                                .priceAdjustment(BigDecimal.ZERO)
                                .isActive(true)
                                .build());
        }

        private Order createOrder(
                        User user,
                        Address address,
                        UUID storeId,
                        Order parent,
                        Order.OrderStatus status,
                        Order.PaymentMethod paymentMethod,
                        Order.PaymentStatus paymentStatus,
                        BigDecimal subtotal,
                        BigDecimal shippingFee,
                        BigDecimal discount,
                        String couponCode) {
                String code = randomCode("ORD");
                Order order = Order.builder()
                                .orderCode(code)
                                .user(user)
                                .shippingAddress(address)
                                .status(status)
                                .paymentMethod(paymentMethod)
                                .paymentStatus(paymentStatus)
                                .subtotal(subtotal)
                                .shippingFee(shippingFee)
                                .discount(discount)
                                .couponCode(couponCode)
                                .storeId(storeId)
                                .parentOrder(parent)
                                .items(new ArrayList<>())
                                .build();
                order.calculateTotal();
                return orderRepository.save(order);
        }

        private Order createOrderWithSingleItem(
                        User user,
                        Address address,
                        UUID storeId,
                        Order parent,
                        Order.OrderStatus status,
                        Order.PaymentMethod paymentMethod,
                        Order.PaymentStatus paymentStatus,
                        BigDecimal subtotal,
                        BigDecimal shippingFee,
                        BigDecimal discount,
                        Product product,
                        ProductVariant variant,
                        int quantity,
                        BigDecimal unitPrice) {
                Order order = createOrder(
                                user,
                                address,
                                storeId,
                                parent,
                                status,
                                paymentMethod,
                                paymentStatus,
                                subtotal,
                                shippingFee,
                                discount,
                                null);

                OrderItem item = OrderItem.builder()
                                .order(order)
                                .product(product)
                                .variant(variant)
                                .productName(product.getName())
                                .variantName(variant == null ? null : variant.getColor() + " / " + variant.getSize())
                                .quantity(quantity)
                                .unitPrice(unitPrice)
                                .totalPrice(unitPrice.multiply(BigDecimal.valueOf(quantity)))
                                .storeId(storeId)
                                .build();

                order.setItems(new ArrayList<>(List.of(item)));
                return orderRepository.save(order);
        }

        @SuppressWarnings("unchecked")
        private String loginAndExtractToken(String email, String password) {
                ResponseEntity<Map> loginResponse = restTemplate.postForEntity(
                                "/api/auth/login",
                                Map.of("email", email, "password", password),
                                Map.class);
                assertEquals(HttpStatus.OK, loginResponse.getStatusCode());
                Map<String, Object> body = loginResponse.getBody();
                assertNotNull(body);
                Object token = body.get("token");
                assertNotNull(token);
                String normalized = String.valueOf(token);
                assertFalse(normalized.isBlank(), "Expected non-empty auth token");
                return normalized;
        }

        private HttpEntity<Object> authorizedJsonEntity(String token, Object body) {
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(token);
                headers.set("Content-Type", "application/json");
                return new HttpEntity<>(body, headers);
        }

        private ResponseEntity<String> patchJson(String path, String token, Object body) throws Exception {
                String payload = body == null ? "" : objectMapper.writeValueAsString(body);
                HttpRequest.Builder builder = HttpRequest.newBuilder()
                                .uri(URI.create("http://localhost:" + port + path))
                                .header("Authorization", "Bearer " + token)
                                .header("Content-Type", "application/json")
                                .method("PATCH", HttpRequest.BodyPublishers.ofString(payload));

                HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
                return ResponseEntity.status(response.statusCode()).body(response.body());
        }

        private String randomCode(String prefix) {
                String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
                return prefix + "-IT-" + suffix;
        }
}
