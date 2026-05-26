package vn.edu.hcmuaf.fit.marketplace.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import vn.edu.hcmuaf.fit.marketplace.entity.Address;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.OrderItem;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductVariant;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.repository.AddressRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductVariantRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReviewControllerCustomerFlowIntegrationTest {

        private static final String TEST_PASSWORD = "Test@123";
        private static final String CUSTOMER_EMAIL = "minh.customer@fashion.local";
        private static final String VENDOR_EMAIL = "an.shop@fashion.local";

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
        private ProductRepository productRepository;

        @Autowired
        private ProductVariantRepository productVariantRepository;

        @Autowired
        private OrderRepository orderRepository;

        @Test
        void customerCanReadEligibleReviewItems() throws Exception {
                FixtureOrder fixtureOrder = createDeliveredOrderFixture(VENDOR_EMAIL, CUSTOMER_EMAIL);
                String customerToken = loginAndExtractToken(CUSTOMER_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> response = restTemplate.exchange(
                                "/api/reviews/my/eligible",
                                HttpMethod.GET,
                                authorizedEntity(customerToken),
                                String.class);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                JsonNode body = objectMapper.readTree(response.getBody());
                assertTrue(body.isArray());

                boolean foundFixture = false;
                for (JsonNode item : body) {
                        if (fixtureOrder.orderId().toString().equals(item.path("orderId").asText())
                                        && fixtureOrder.productId().toString()
                                                        .equals(item.path("productId").asText())) {
                                foundFixture = true;
                                break;
                        }
                }
                assertTrue(foundFixture, "Expected eligible list to include delivered fixture order item");
        }

        @Test
        void vendorCanReadEligibleReviewItems() throws Exception {
                String vendorToken = loginAndExtractToken(VENDOR_EMAIL, TEST_PASSWORD);
                ResponseEntity<String> response = restTemplate.exchange(
                                "/api/reviews/my/eligible",
                                HttpMethod.GET,
                                authorizedEntity(vendorToken),
                                String.class);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                JsonNode body = objectMapper.readTree(response.getBody());
                assertTrue(body.isArray());
        }

        @Test
        void customerCanSubmitReviewAndCannotDuplicateSameOrderItem() throws Exception {
                FixtureOrder fixtureOrder = createDeliveredOrderFixture(VENDOR_EMAIL, CUSTOMER_EMAIL);
                String customerToken = loginAndExtractToken(CUSTOMER_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> eligibleResponse = restTemplate.exchange(
                                "/api/reviews/my/eligible",
                                HttpMethod.GET,
                                authorizedEntity(customerToken),
                                String.class);
                assertEquals(HttpStatus.OK, eligibleResponse.getStatusCode());
                JsonNode eligible = objectMapper.readTree(eligibleResponse.getBody());

                boolean foundFixture = false;
                for (JsonNode item : eligible) {
                        if (fixtureOrder.orderId().toString().equals(item.path("orderId").asText())
                                        && fixtureOrder.productId().toString()
                                                        .equals(item.path("productId").asText())) {
                                foundFixture = true;
                                break;
                        }
                }
                assertTrue(foundFixture, "Expected eligible item before submit");

                Map<String, Object> payload = new HashMap<>();
                payload.put("orderId", fixtureOrder.orderId().toString());
                payload.put("productId", fixtureOrder.productId().toString());
                payload.put("rating", 5);
                payload.put("title", "Integration test review");
                payload.put("content", "Flow works end to end.");
                payload.put("images", new String[0]);

                ResponseEntity<String> createResponse = restTemplate.exchange(
                                "/api/reviews",
                                HttpMethod.POST,
                                authorizedJsonEntity(customerToken, payload),
                                String.class);
                assertEquals(HttpStatus.OK, createResponse.getStatusCode());
                JsonNode createdBody = objectMapper.readTree(createResponse.getBody());
                assertEquals(fixtureOrder.orderId().toString(), createdBody.get("orderId").asText());
                assertEquals(fixtureOrder.productId().toString(), createdBody.get("productId").asText());
                assertEquals("APPROVED", createdBody.get("status").asText());

                ResponseEntity<String> duplicateResponse = restTemplate.exchange(
                                "/api/reviews",
                                HttpMethod.POST,
                                authorizedJsonEntity(customerToken, payload),
                                String.class);
                assertEquals(HttpStatus.CONFLICT, duplicateResponse.getStatusCode());

                ResponseEntity<String> eligibleAfter = restTemplate.exchange(
                                "/api/reviews/my/eligible",
                                HttpMethod.GET,
                                authorizedEntity(customerToken),
                                String.class);
                assertEquals(HttpStatus.OK, eligibleAfter.getStatusCode());
                JsonNode eligibleAfterBody = objectMapper.readTree(eligibleAfter.getBody());
                boolean stillContainsSameItem = false;
                for (JsonNode item : eligibleAfterBody) {
                        if (fixtureOrder.orderId().toString().equals(item.path("orderId").asText())
                                        && fixtureOrder.productId().toString()
                                                        .equals(item.path("productId").asText())) {
                                stillContainsSameItem = true;
                                break;
                        }
                }
                assertFalse(stillContainsSameItem, "Submitted item should no longer be eligible");
        }

        @Test
        void customerCannotSubmitReviewForUnpurchasedProduct() {
                String customerToken = loginAndExtractToken(CUSTOMER_EMAIL, TEST_PASSWORD);
                User vendor = userRepository.findByEmail(VENDOR_EMAIL).orElseThrow();
                Store store = storeRepository.findByOwnerId(vendor.getId()).orElseThrow();

                String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
                Product unpurchasedProduct = productRepository.save(Product.builder()
                                .name("Unpurchased " + suffix)
                                .slug("unpurchased-" + suffix.toLowerCase(Locale.ROOT))
                                .sku("UNPUR-" + suffix)
                                .stockQuantity(5)
                                .storeId(store.getId())
                                .basePrice(new BigDecimal("119000"))
                                .salePrice(new BigDecimal("99000"))
                                .status(Product.ProductStatus.ACTIVE)
                                .approvalStatus(Product.ApprovalStatus.APPROVED)
                                .build());

                Map<String, Object> payload = new HashMap<>();
                payload.put("productId", unpurchasedProduct.getId());
                payload.put("rating", 4);
                payload.put("title", "Should be rejected");
                payload.put("content", "Trying to review unpurchased product");
                payload.put("images", new String[0]);

                ResponseEntity<String> response = restTemplate.exchange(
                                "/api/reviews",
                                HttpMethod.POST,
                                authorizedJsonEntity(customerToken, payload),
                                String.class);
                assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        }

        @Test
        void vendorReplyCreatesRealtimeReviewNotificationForCustomer() throws Exception {
                FixtureOrder fixtureOrder = createDeliveredOrderFixture(VENDOR_EMAIL, CUSTOMER_EMAIL);
                String customerToken = loginAndExtractToken(CUSTOMER_EMAIL, TEST_PASSWORD);
                String vendorToken = loginAndExtractToken(VENDOR_EMAIL, TEST_PASSWORD);

                Map<String, Object> createPayload = new HashMap<>();
                createPayload.put("orderId", fixtureOrder.orderId().toString());
                createPayload.put("productId", fixtureOrder.productId().toString());
                createPayload.put("rating", 5);
                createPayload.put("title", "Fixture review");
                createPayload.put("content", "Customer feedback fixture");
                createPayload.put("images", new String[0]);

                ResponseEntity<String> createResponse = restTemplate.exchange(
                                "/api/reviews",
                                HttpMethod.POST,
                                authorizedJsonEntity(customerToken, createPayload),
                                String.class);
                assertEquals(HttpStatus.OK, createResponse.getStatusCode());
                JsonNode created = objectMapper.readTree(createResponse.getBody());
                String reviewId = created.path("id").asText();
                assertFalse(reviewId.isBlank());

                Map<String, Object> replyPayload = new HashMap<>();
                replyPayload.put("reply", "Shop đã phản hồi đánh giá của bạn (" + System.currentTimeMillis() + ").");
                ResponseEntity<String> replyResponse = restTemplate.exchange(
                                "/api/reviews/my-store/" + reviewId + "/reply",
                                HttpMethod.POST,
                                authorizedJsonEntity(vendorToken, replyPayload),
                                String.class);
                assertEquals(HttpStatus.OK, replyResponse.getStatusCode());

                ResponseEntity<String> notificationsResponse = restTemplate.exchange(
                                "/api/notifications/me?type=review&page=0&size=20",
                                HttpMethod.GET,
                                authorizedEntity(customerToken),
                                String.class);
                assertEquals(HttpStatus.OK, notificationsResponse.getStatusCode());
                JsonNode notificationsBody = objectMapper.readTree(notificationsResponse.getBody());
                JsonNode content = notificationsBody.get("content");
                assertTrue(content.isArray());

                boolean foundReviewNotification = false;
                for (JsonNode item : content) {
                        if ("review".equalsIgnoreCase(item.path("type").asText())
                                        && ("/product/" + fixtureOrder.productId() + "?reviewId=" + reviewId)
                                                        .equals(item.path("link").asText())
                                        && item.path("title").asText().contains("phản hồi đánh giá")) {
                                foundReviewNotification = true;
                                break;
                        }
                }
                assertTrue(foundReviewNotification, "Expected a review notification with dynamic deeplink");
        }

        private FixtureOrder createDeliveredOrderFixture(String vendorEmail, String customerEmail) {
                User vendor = userRepository.findByEmail(vendorEmail)
                                .orElseThrow(() -> new IllegalStateException(
                                                "Missing vendor fixture user: " + vendorEmail));
                Store store = storeRepository.findByOwnerId(vendor.getId())
                                .orElseThrow(() -> new IllegalStateException(
                                                "Missing fixture store for vendor: " + vendorEmail));
                User customer = userRepository.findByEmail(customerEmail)
                                .orElseThrow(() -> new IllegalStateException(
                                                "Missing customer fixture user: " + customerEmail));
                Address address = getOrCreateDefaultAddress(customer);

                String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
                Product product = productRepository.save(Product.builder()
                                .name("Review Fixture " + suffix)
                                .slug("review-fixture-" + suffix.toLowerCase(Locale.ROOT))
                                .sku("RV-P-" + suffix)
                                .stockQuantity(8)
                                .storeId(store.getId())
                                .basePrice(new BigDecimal("199000"))
                                .salePrice(new BigDecimal("159000"))
                                .status(Product.ProductStatus.ACTIVE)
                                .approvalStatus(Product.ApprovalStatus.APPROVED)
                                .build());
                ProductVariant variant = productVariantRepository.save(ProductVariant.builder()
                                .product(product)
                                .sku("RV-V-" + suffix)
                                .color("Blue")
                                .size("M")
                                .stockQuantity(8)
                                .priceAdjustment(BigDecimal.ZERO)
                                .isActive(true)
                                .build());

                Order order = Order.builder()
                                .orderCode("ORD-RV-" + suffix)
                                .user(customer)
                                .shippingAddress(address)
                                .storeId(store.getId())
                                .status(Order.OrderStatus.DELIVERED)
                                .paymentMethod(Order.PaymentMethod.COD)
                                .paymentStatus(Order.PaymentStatus.PAID)
                                .subtotal(new BigDecimal("159000"))
                                .shippingFee(BigDecimal.ZERO)
                                .discount(BigDecimal.ZERO)
                                .items(new ArrayList<>())
                                .build();
                order.calculateTotal();
                Order savedOrder = orderRepository.save(order);

                OrderItem item = OrderItem.builder()
                                .order(savedOrder)
                                .product(product)
                                .variant(variant)
                                .productName(product.getName())
                                .variantName(variant.getColor() + " / " + variant.getSize())
                                .quantity(1)
                                .unitPrice(new BigDecimal("159000"))
                                .totalPrice(new BigDecimal("159000"))
                                .storeId(store.getId())
                                .build();
                savedOrder.setItems(new ArrayList<>(List.of(item)));
                Order persisted = orderRepository.save(savedOrder);
                return new FixtureOrder(persisted.getId(), product.getId());
        }

        private Address getOrCreateDefaultAddress(User user) {
                return addressRepository.findByUserIdOrderByIsDefaultDesc(user.getId())
                                .stream()
                                .findFirst()
                                .orElseGet(() -> addressRepository.save(Address.builder()
                                                .user(user)
                                                .fullName(user.getName() == null || user.getName().isBlank()
                                                                ? "Test User"
                                                                : user.getName())
                                                .phone(user.getPhone() == null || user.getPhone().isBlank()
                                                                ? "0900000000"
                                                                : user.getPhone())
                                                .province("TP. Hồ Chí Minh")
                                                .district("Quận 1")
                                                .ward("Bến Nghé")
                                                .detail("1 Test Street")
                                                .isDefault(true)
                                                .build()));
        }

        @SuppressWarnings("unchecked")
        private String loginAndExtractToken(String email, String password) {
                Map<String, String> payload = Map.of(
                                "email", email,
                                "password", password);
                ResponseEntity<Map> loginResponse = restTemplate.postForEntity("/api/auth/login", payload, Map.class);
                assertEquals(HttpStatus.OK, loginResponse.getStatusCode());
                Map<String, Object> body = loginResponse.getBody();
                assertNotNull(body);
                Object token = body.get("token");
                assertNotNull(token);
                return String.valueOf(token);
        }

        private HttpEntity<Void> authorizedEntity(String token) {
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(token);
                return new HttpEntity<>(headers);
        }

        private HttpEntity<Map<String, Object>> authorizedJsonEntity(String token, Map<String, Object> body) {
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(token);
                headers.setContentType(MediaType.APPLICATION_JSON);
                return new HttpEntity<>(body, headers);
        }

        private record FixtureOrder(UUID orderId, UUID productId) {
        }
}
