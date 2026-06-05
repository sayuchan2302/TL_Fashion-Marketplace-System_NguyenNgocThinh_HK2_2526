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
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PublicCodeLookupIntegrationTest {

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
        private ProductRepository productRepository;

        @Autowired
        private ProductVariantRepository productVariantRepository;

        @Autowired
        private OrderRepository orderRepository;

        @Autowired
        private ReturnRequestRepository returnRequestRepository;

        @Test
        void customerCanLookupOwnOrderByCode() throws Exception {
                Order fixtureOrder = createFixtureOrder(VENDOR_EMAIL, CUSTOMER_EMAIL, Order.OrderStatus.DELIVERED);
                String token = loginAndExtractToken(CUSTOMER_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> detailResponse = restTemplate.exchange(
                                "/api/orders/code/" + fixtureOrder.getOrderCode(),
                                HttpMethod.GET,
                                authorizedEntity(token),
                                String.class);
                assertEquals(HttpStatus.OK, detailResponse.getStatusCode());
                JsonNode detail = objectMapper.readTree(detailResponse.getBody());
                assertEquals(fixtureOrder.getOrderCode(), detail.path("code").asText());
        }

        @Test
        void vendorCanLookupStoreOrderByCode() throws Exception {
                Order fixtureOrder = createFixtureOrder(VENDOR_EMAIL, CUSTOMER_EMAIL,
                                Order.OrderStatus.WAITING_FOR_VENDOR);
                String token = loginAndExtractToken(VENDOR_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> detailResponse = restTemplate.exchange(
                                "/api/orders/my-store/code/" + fixtureOrder.getOrderCode(),
                                HttpMethod.GET,
                                authorizedEntity(token),
                                String.class);
                assertEquals(HttpStatus.OK, detailResponse.getStatusCode());
                JsonNode detail = objectMapper.readTree(detailResponse.getBody());
                assertEquals(fixtureOrder.getOrderCode(), detail.path("code").asText());
        }

        @Test
        void customerCannotAccessVendorStoreOrderByCode() {
                String token = loginAndExtractToken(CUSTOMER_EMAIL, TEST_PASSWORD);
                ResponseEntity<String> response = restTemplate.exchange(
                                "/api/orders/my-store/code/DH-999999-000001",
                                HttpMethod.GET,
                                authorizedEntity(token),
                                String.class);
                assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        }

        @Test
        void adminCanLookupReturnByCode() throws Exception {
                ReturnRequest fixtureReturn = createFixtureReturn(VENDOR_EMAIL, CUSTOMER_EMAIL);
                String adminToken = loginAndExtractToken(ADMIN_EMAIL, TEST_PASSWORD);

                ResponseEntity<String> detailResponse = restTemplate.exchange(
                                "/api/returns/code/" + fixtureReturn.getReturnCode(),
                                HttpMethod.GET,
                                authorizedEntity(adminToken),
                                String.class);
                assertEquals(HttpStatus.OK, detailResponse.getStatusCode());
                JsonNode detail = objectMapper.readTree(detailResponse.getBody());
                assertEquals(fixtureReturn.getReturnCode(), detail.path("code").asText());
        }

        @Test
        void vendorCannotAccessReturnLookupByCode() {
                String token = loginAndExtractToken(VENDOR_EMAIL, TEST_PASSWORD);
                ResponseEntity<String> response = restTemplate.exchange(
                                "/api/returns/code/TH-999999-000001",
                                HttpMethod.GET,
                                authorizedEntity(token),
                                String.class);
                assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        }

        private ReturnRequest createFixtureReturn(String vendorEmail, String customerEmail) {
                Order order = createFixtureOrder(vendorEmail, customerEmail, Order.OrderStatus.DELIVERED);
                Order orderWithItems = orderRepository.findByIdWithItems(order.getId()).orElseThrow();
                OrderItem item = orderWithItems.getItems().stream().findFirst().orElseThrow();

                return returnRequestRepository.save(ReturnRequest.builder()
                                .returnCode("RT-LOOKUP-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8)
                                                .toUpperCase(Locale.ROOT))
                                .order(orderWithItems)
                                .user(orderWithItems.getUser())
                                .storeId(orderWithItems.getStoreId())
                                .reason(ReturnRequest.ReturnReason.OTHER)
                                .resolution(ReturnRequest.ReturnResolution.REFUND)
                                .status(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER)
                                .note("Lookup fixture")
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
                                .build());
        }

        private Order createFixtureOrder(String vendorEmail, String customerEmail, Order.OrderStatus status) {
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
                                .name("Lookup Product " + suffix)
                                .slug("lookup-product-" + suffix.toLowerCase(Locale.ROOT))
                                .sku("LOOKUP-P-" + suffix)
                                .stockQuantity(10)
                                .storeId(store.getId())
                                .basePrice(new BigDecimal("199000"))
                                .salePrice(new BigDecimal("149000"))
                                .status(Product.ProductStatus.ACTIVE)
                                .approvalStatus(Product.ApprovalStatus.APPROVED)
                                .build());
                ProductVariant variant = productVariantRepository.save(ProductVariant.builder()
                                .product(product)
                                .sku("LOOKUP-V-" + suffix)
                                .color("Black")
                                .size("M")
                                .stockQuantity(10)
                                .priceAdjustment(BigDecimal.ZERO)
                                .isActive(true)
                                .build());

                Order order = Order.builder()
                                .orderCode("ORD-LOOKUP-" + suffix)
                                .user(customer)
                                .shippingAddress(address)
                                .storeId(store.getId())
                                .status(status)
                                .paymentMethod(Order.PaymentMethod.COD)
                                .paymentStatus(status == Order.OrderStatus.DELIVERED ? Order.PaymentStatus.PAID
                                                : Order.PaymentStatus.UNPAID)
                                .subtotal(new BigDecimal("149000"))
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
                                .unitPrice(new BigDecimal("149000"))
                                .totalPrice(new BigDecimal("149000"))
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
}
