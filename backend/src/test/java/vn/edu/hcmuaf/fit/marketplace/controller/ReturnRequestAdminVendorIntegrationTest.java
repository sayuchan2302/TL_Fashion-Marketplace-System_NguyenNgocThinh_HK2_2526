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
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.OrderItem;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductVariant;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.repository.AddressRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductVariantRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReturnRequestAdminVendorIntegrationTest {

        private static final String TEST_PASSWORD = "Test@123";
        private static final String ADMIN_EMAIL = "admin@fashion.local";
        private static final String VENDOR_AN_EMAIL = "an.shop@fashion.local";
        private static final String VENDOR_BINH_EMAIL = "binh.store@fashion.local";
        private static final String CUSTOMER_MINH_EMAIL = "minh.customer@fashion.local";
        private static final String CUSTOMER_LAN_EMAIL = "lan.customer@fashion.local";

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
        private ReturnRequestRepository returnRequestRepository;

        @LocalServerPort
        private int port;

        private final HttpClient httpClient = HttpClient.newHttpClient();

        @Test
        void vendorCannotAcceptReturnOutsideOwnStore() throws Exception {
                ReturnRequest target = createReturnFixture(
                                VENDOR_BINH_EMAIL,
                                CUSTOMER_LAN_EMAIL,
                                ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER,
                                "OUTSIDE");
                String vendorToken = loginAndExtractToken(VENDOR_AN_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> response = exchangePatch(
                                "/api/returns/my-store/" + target.getId() + "/approve",
                                vendorToken,
                                null);

                assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        }

        @Test
        void customerCannotApplyAdminFinalVerdict() throws Exception {
                ReturnRequest disputed = createReturnFixture(
                                VENDOR_AN_EMAIL,
                                CUSTOMER_MINH_EMAIL,
                                ReturnRequest.ReturnStatus.DISPUTING,
                                "NOADM");
                String customerToken = loginAndExtractToken(CUSTOMER_MINH_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> response = exchangePatch(
                                "/api/returns/admin/" + disputed.getId() + "/verdict",
                                customerToken,
                                Map.of(
                                                "action", "RELEASE_TO_VENDOR",
                                                "adminNote", "Customer should not access this endpoint"));

                assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        }

        @Test
        void adminFinalVerdictReleaseLocksFurtherCustomerDispute() throws Exception {
                ReturnRequest disputed = createReturnFixture(
                                VENDOR_AN_EMAIL,
                                CUSTOMER_MINH_EMAIL,
                                ReturnRequest.ReturnStatus.DISPUTING,
                                "LOCK");
                String adminToken = loginAndExtractToken(ADMIN_EMAIL, TEST_PASSWORD);
                String customerToken = loginAndExtractToken(CUSTOMER_MINH_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> verdictResponse = exchangePatch(
                                "/api/returns/admin/" + disputed.getId() + "/verdict",
                                adminToken,
                                Map.of(
                                                "action", "RELEASE_TO_VENDOR",
                                                "adminNote", "Final rejection by admin"));
                assertEquals(HttpStatus.OK, verdictResponse.getStatusCode());
                JsonNode verdictBody = objectMapper.readTree(verdictResponse.getBody());
                assertEquals("RETURN_REJECTED", verdictBody.path("status").asText());

                ResponseEntity<String> disputeAgainResponse = exchangePatch(
                                "/api/returns/" + disputed.getId() + "/dispute",
                                customerToken,
                                Map.of("reason", "Trying to reopen after final verdict"));
                assertEquals(HttpStatus.BAD_REQUEST, disputeAgainResponse.getStatusCode());
        }

        @Test
        void vendorListSupportsStatusesAndKeywordFilters() throws Exception {
                ReturnRequest disputed = createReturnFixture(
                                VENDOR_AN_EMAIL,
                                CUSTOMER_MINH_EMAIL,
                                ReturnRequest.ReturnStatus.DISPUTING,
                                "FILTER");
                String vendorToken = loginAndExtractToken(VENDOR_AN_EMAIL, TEST_PASSWORD);
                String encodedKeyword = URLEncoder.encode(disputed.getReturnCode(), StandardCharsets.UTF_8);

                ResponseEntity<String> response = restTemplate.exchange(
                                "/api/returns/my-store?statuses=DISPUTING&q=" + encodedKeyword + "&page=0&size=20",
                                HttpMethod.GET,
                                authorizedEntity(vendorToken),
                                String.class);
                assertEquals(HttpStatus.OK, response.getStatusCode());

                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode content = root.path("content");
                assertTrue(content.isArray());
                assertTrue(content.size() > 0, "Expected at least one filtered return");

                boolean foundFixture = false;
                for (JsonNode row : content) {
                        assertEquals("DISPUTING", row.path("status").asText());
                        if (disputed.getId().toString().equals(row.path("id").asText())) {
                                foundFixture = true;
                        }
                }
                assertTrue(foundFixture, "Expected filtered list to include created disputed fixture");
        }

        @Test
        void adminCanRequestMoreEvidenceAndCustomerCanSubmitIt() throws Exception {
                ReturnRequest disputed = createReturnFixture(
                                VENDOR_AN_EMAIL,
                                CUSTOMER_MINH_EMAIL,
                                ReturnRequest.ReturnStatus.DISPUTING,
                                "EVIDENCE");
                String adminToken = loginAndExtractToken(ADMIN_EMAIL, TEST_PASSWORD);
                String customerToken = loginAndExtractToken(CUSTOMER_MINH_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> requestResponse = exchangePost(
                                "/api/returns/admin/" + disputed.getId() + "/evidence-requests",
                                adminToken,
                                Map.of("message", "Vui lòng bổ sung ảnh kiện hàng sau khi mở"));
                assertEquals(HttpStatus.OK, requestResponse.getStatusCode());
                JsonNode requestBody = objectMapper.readTree(requestResponse.getBody());
                JsonNode evidenceRequests = requestBody.path("additionalEvidenceRequests");
                assertTrue(evidenceRequests.isArray());
                assertTrue(evidenceRequests.size() > 0);
                String evidenceRequestId = evidenceRequests.get(0).path("id").asText();
                assertFalse(evidenceRequestId.isBlank());

                ResponseEntity<String> submitResponse = exchangePost(
                                "/api/returns/" + disputed.getId() + "/additional-evidence",
                                customerToken,
                                Map.of(
                                                "requestId", evidenceRequestId,
                                                "note", "Ảnh kiện hàng ngay sau khi nhận",
                                                "evidenceUrl", "/uploads/returns/customer-extra.jpg"));
                assertEquals(HttpStatus.OK, submitResponse.getStatusCode());
                JsonNode submitBody = objectMapper.readTree(submitResponse.getBody());
                JsonNode evidence = submitBody.path("additionalEvidenceRequests").get(0).path("evidence");
                assertTrue(evidence.isArray());
                assertEquals("CUSTOMER", evidence.get(0).path("submittedByRole").asText());
                assertEquals("/uploads/returns/customer-extra.jpg", evidence.get(0).path("evidenceUrl").asText());
        }

        @Test
        void vendorCannotSubmitAdditionalEvidenceOutsideOwnStore() throws Exception {
                ReturnRequest disputed = createReturnFixture(
                                VENDOR_BINH_EMAIL,
                                CUSTOMER_LAN_EMAIL,
                                ReturnRequest.ReturnStatus.DISPUTING,
                                "EVIDFORBID");
                String adminToken = loginAndExtractToken(ADMIN_EMAIL, TEST_PASSWORD);
                String vendorToken = loginAndExtractToken(VENDOR_AN_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> requestResponse = exchangePost(
                                "/api/returns/admin/" + disputed.getId() + "/evidence-requests",
                                adminToken,
                                Map.of("message", "Bổ sung ảnh kiểm hàng"));
                assertEquals(HttpStatus.OK, requestResponse.getStatusCode());
                JsonNode requestBody = objectMapper.readTree(requestResponse.getBody());
                String evidenceRequestId = requestBody.path("additionalEvidenceRequests").get(0).path("id").asText();

                ResponseEntity<String> submitResponse = exchangePost(
                                "/api/returns/" + disputed.getId() + "/additional-evidence",
                                vendorToken,
                                Map.of(
                                                "requestId", evidenceRequestId,
                                                "note", "Ảnh kiểm hàng của vendor khác",
                                                "evidenceUrl", "/uploads/returns/vendor-extra.jpg"));

                assertEquals(HttpStatus.FORBIDDEN, submitResponse.getStatusCode());
        }

        private ReturnRequest createReturnFixture(
                        String vendorEmail,
                        String customerEmail,
                        ReturnRequest.ReturnStatus status,
                        String tag) {
                User vendor = userRepository.findByEmail(vendorEmail)
                                .orElseThrow(() -> new IllegalStateException(
                                                "Missing vendor fixture user: " + vendorEmail));
                Store store = storeRepository.findByOwnerId(vendor.getId())
                                .orElseThrow(() -> new IllegalStateException(
                                                "Missing fixture store for vendor: " + vendorEmail));
                User customer = userRepository.findByEmail(customerEmail)
                                .orElseThrow(() -> new IllegalStateException(
                                                "Missing customer fixture user: " + customerEmail));

                Optional<Order> candidate = orderRepository.findByUserIdOrderByCreatedAtDesc(customer.getId()).stream()
                                .filter(order -> store.getId().equals(order.getStoreId()))
                                .findFirst();
                Order order = candidate.orElseGet(() -> createFixtureOrderForStore(store, customer));
                Order orderWithItems = orderRepository.findByIdWithItems(order.getId())
                                .orElseThrow(() -> new IllegalStateException(
                                                "Missing fixture order with items: " + order.getId()));
                OrderItem item = orderWithItems.getItems().stream().findFirst()
                                .orElseGet(() -> {
                                        Order recreated = createFixtureOrderForStore(store, customer);
                                        return orderRepository.findByIdWithItems(recreated.getId())
                                                        .orElseThrow(() -> new IllegalStateException(
                                                                        "Missing recreated order with items: "
                                                                                        + recreated.getId()))
                                                        .getItems()
                                                        .stream()
                                                        .findFirst()
                                                        .orElseThrow(() -> new IllegalStateException(
                                                                        "Recreated fixture order has no items: "
                                                                                        + recreated.getId()));
                                });

                ReturnRequest request = ReturnRequest.builder()
                                .returnCode(buildReturnCode(tag))
                                .order(orderWithItems)
                                .user(customer)
                                .storeId(store.getId())
                                .reason(ReturnRequest.ReturnReason.OTHER)
                                .resolution(ReturnRequest.ReturnResolution.REFUND)
                                .status(status)
                                .note("Integration test fixture")
                                .vendorReason(status == ReturnRequest.ReturnStatus.RETURN_REJECTED
                                                || status == ReturnRequest.ReturnStatus.DISPUTING
                                                                ? "Vendor rejected fixture"
                                                                : null)
                                .disputeReason(status == ReturnRequest.ReturnStatus.DISPUTING
                                                ? "Customer opened dispute fixture"
                                                : null)
                                .adminFinalized(false)
                                .updatedBy("integration-test")
                                .items(List.of(new ReturnRequest.ReturnItemSnapshot(
                                                item.getId(),
                                                item.getProductName(),
                                                item.getVariantName(),
                                                item.getProductImage(),
                                                null,
                                                1,
                                                item.getUnitPrice())))
                                .build();

                return returnRequestRepository.save(request);
        }

        private Order createFixtureOrderForStore(Store store, User customer) {
                Address address = getOrCreateDefaultAddress(customer);
                String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
                Product product = productRepository.save(Product.builder()
                                .name("Return Fixture " + suffix)
                                .slug("return-fixture-" + suffix.toLowerCase(Locale.ROOT))
                                .sku("RT-P-" + suffix)
                                .stockQuantity(20)
                                .storeId(store.getId())
                                .basePrice(new BigDecimal("120000"))
                                .salePrice(new BigDecimal("99000"))
                                .status(Product.ProductStatus.ACTIVE)
                                .approvalStatus(Product.ApprovalStatus.APPROVED)
                                .build());
                ProductVariant variant = productVariantRepository.save(ProductVariant.builder()
                                .product(product)
                                .sku("RT-V-" + suffix)
                                .color("Black")
                                .size("L")
                                .stockQuantity(20)
                                .priceAdjustment(BigDecimal.ZERO)
                                .isActive(true)
                                .build());

                Order order = Order.builder()
                                .orderCode("ORD-RT-" + suffix)
                                .user(customer)
                                .shippingAddress(address)
                                .storeId(store.getId())
                                .status(Order.OrderStatus.DELIVERED)
                                .paymentMethod(Order.PaymentMethod.COD)
                                .paymentStatus(Order.PaymentStatus.PAID)
                                .subtotal(new BigDecimal("99000"))
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
                                .unitPrice(new BigDecimal("99000"))
                                .totalPrice(new BigDecimal("99000"))
                                .storeId(store.getId())
                                .build();
                savedOrder.setItems(new ArrayList<>(List.of(item)));
                return orderRepository.save(savedOrder);
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

        private String buildReturnCode(String tag) {
                String normalizedTag = tag == null ? "TEST" : tag.trim().toUpperCase();
                if (normalizedTag.isBlank()) {
                        normalizedTag = "TEST";
                }
                if (normalizedTag.length() > 10) {
                        normalizedTag = normalizedTag.substring(0, 10);
                }
                String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
                return "RT-IT-" + normalizedTag + "-" + suffix;
        }

        @SuppressWarnings("unchecked")
        private String loginAndExtractToken(String email, String password) {
                Map<String, String> payload = Map.of("email", email, "password", password);
                ResponseEntity<Map> loginResponse = restTemplate.postForEntity("/api/auth/login", payload, Map.class);
                assertEquals(HttpStatus.OK, loginResponse.getStatusCode());
                Map<String, Object> body = loginResponse.getBody();
                assertNotNull(body);
                Object token = body.get("token");
                assertNotNull(token);
                String normalizedToken = String.valueOf(token);
                assertFalse(normalizedToken.isBlank(), "Expected login token to be non-empty");
                return normalizedToken;
        }

        private HttpEntity<Void> authorizedEntity(String token) {
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(token);
                return new HttpEntity<>(headers);
        }

        private ResponseEntity<String> exchangePatch(String path, String token, Map<String, String> body)
                        throws Exception {
                String payload = body == null ? "" : objectMapper.writeValueAsString(body);
                HttpRequest.Builder builder = HttpRequest.newBuilder()
                                .uri(URI.create("http://localhost:" + port + path))
                                .header("Authorization", "Bearer " + token)
                                .header("Content-Type", "application/json")
                                .method("PATCH", HttpRequest.BodyPublishers.ofString(payload));
                HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
                return ResponseEntity.status(response.statusCode()).body(response.body());
        }

        private ResponseEntity<String> exchangePost(String path, String token, Map<String, ?> body)
                        throws Exception {
                String payload = body == null ? "" : objectMapper.writeValueAsString(body);
                HttpRequest.Builder builder = HttpRequest.newBuilder()
                                .uri(URI.create("http://localhost:" + port + path))
                                .header("Authorization", "Bearer " + token)
                                .header("Content-Type", "application/json")
                                .POST(HttpRequest.BodyPublishers.ofString(payload));
                HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
                return ResponseEntity.status(response.statusCode()).body(response.body());
        }

}
