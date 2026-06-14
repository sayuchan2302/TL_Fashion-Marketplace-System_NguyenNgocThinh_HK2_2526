package vn.edu.hcmuaf.fit.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.dto.request.ReturnAdminVerdictRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.request.ReturnSubmitRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.ReturnRequestResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.OrderItem;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnAdditionalEvidence;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnEvidenceRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnAdditionalEvidenceRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnEvidenceRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReturnRequestServiceTest {

        @Mock
        private ReturnRequestRepository returnRequestRepository;

        @Mock
        private OrderRepository orderRepository;

        @Mock
        private StoreRepository storeRepository;

        @Mock
        private ReturnEvidenceRequestRepository returnEvidenceRequestRepository;

        @Mock
        private ReturnAdditionalEvidenceRepository returnAdditionalEvidenceRepository;

        private WalletService walletService;

        private ReturnRequestService returnRequestService;
        private FixedPublicCodeService publicCodeService;
        private RecordingWalletService recordingWalletService;

        @BeforeEach
        void setUp() {
                publicCodeService = new FixedPublicCodeService();
                recordingWalletService = new RecordingWalletService();
                walletService = recordingWalletService;
                returnRequestService = new ReturnRequestService(
                                returnRequestRepository,
                                orderRepository,
                                storeRepository,
                                publicCodeService,
                                walletService,
                                null,
                                null,
                                returnEvidenceRequestRepository,
                                returnAdditionalEvidenceRepository);
        }

        @Test
        void submitRejectsWhenOrderNotDelivered() {
                UUID userId = UUID.randomUUID();
                UUID orderId = UUID.randomUUID();
                User user = buildUser(userId);
                Order order = buildOrder(orderId, user, Order.OrderStatus.SHIPPED, List.of());

                when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

                ReturnSubmitRequest payload = buildSubmitPayload(orderId,
                                List.of(buildItemPayload(UUID.randomUUID(), 1)));

                ResponseStatusException ex = assertThrows(
                                ResponseStatusException.class,
                                () -> returnRequestService.submit(userId, payload));

                assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
                assertEquals("Returns are only allowed for delivered orders", ex.getReason());
        }

        @Test
        void submitRejectsWhenReturnWindowExpired() {
                UUID userId = UUID.randomUUID();
                UUID orderId = UUID.randomUUID();
                UUID orderItemId = UUID.randomUUID();
                UUID storeId = UUID.randomUUID();

                User user = buildUser(userId);
                OrderItem orderItem = buildOrderItem(orderItemId, storeId, 1, new BigDecimal("120000"));
                Order order = buildOrder(orderId, user, Order.OrderStatus.DELIVERED, List.of(orderItem));
                order.setEscrowDeadlineAt(LocalDateTime.now().minusSeconds(1));

                when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

                ReturnSubmitRequest payload = buildSubmitPayload(orderId, List.of(buildItemPayload(orderItemId, 1)));

                ResponseStatusException ex = assertThrows(
                                ResponseStatusException.class,
                                () -> returnRequestService.submit(userId, payload));

                assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
                assertEquals("Escrow period has expired or order is completed", ex.getReason());
        }

        @Test
        void submitRejectsDuplicateOrderItemsInSamePayload() {
                UUID userId = UUID.randomUUID();
                UUID orderId = UUID.randomUUID();
                UUID orderItemId = UUID.randomUUID();
                UUID storeId = UUID.randomUUID();

                User user = buildUser(userId);
                OrderItem orderItem = buildOrderItem(orderItemId, storeId, 2, new BigDecimal("120000"));
                Order order = buildOrder(orderId, user, Order.OrderStatus.DELIVERED, List.of(orderItem));

                when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

                ReturnSubmitRequest payload = buildSubmitPayload(
                                orderId,
                                List.of(
                                                buildItemPayload(orderItemId, 1),
                                                buildItemPayload(orderItemId, 1)));

                ResponseStatusException ex = assertThrows(
                                ResponseStatusException.class,
                                () -> returnRequestService.submit(userId, payload));

                assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
                assertEquals("Duplicate order item in return request", ex.getReason());
        }

        @Test
        void submitRejectsWhenAnOpenReturnAlreadyExistsForSameItem() {
                UUID userId = UUID.randomUUID();
                UUID orderId = UUID.randomUUID();
                UUID orderItemId = UUID.randomUUID();
                UUID storeId = UUID.randomUUID();

                User user = buildUser(userId);
                OrderItem orderItem = buildOrderItem(orderItemId, storeId, 2, new BigDecimal("120000"));
                Order order = buildOrder(orderId, user, Order.OrderStatus.DELIVERED, List.of(orderItem));

                ReturnRequest existingOpenRequest = ReturnRequest.builder()
                                .id(UUID.randomUUID())
                                .order(order)
                                .user(user)
                                .status(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER)
                                .items(List.of(new ReturnRequest.ReturnItemSnapshot(
                                                orderItemId,
                                                "Polo Shirt",
                                                "M",
                                                "https://example.com/item.jpg",
                                                null,
                                                1,
                                                new BigDecimal("120000"))))
                                .build();

                when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
                when(returnRequestRepository.findByOrderId(orderId)).thenReturn(List.of(existingOpenRequest));

                ReturnSubmitRequest payload = buildSubmitPayload(orderId, List.of(buildItemPayload(orderItemId, 1)));

                ResponseStatusException ex = assertThrows(
                                ResponseStatusException.class,
                                () -> returnRequestService.submit(userId, payload));

                assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
                assertEquals("One or more items already have an active return request", ex.getReason());
        }

        @Test
        void sellerDisputeRejectsWhenStatusIsInvalid() {
                UUID returnId = UUID.randomUUID();
                UUID storeId = UUID.randomUUID();

                User user = buildUser(UUID.randomUUID());
                Order order = buildOrder(UUID.randomUUID(), user, Order.OrderStatus.DELIVERED, List.of());
                ReturnRequest request = ReturnRequest.builder()
                                .id(returnId)
                                .order(order)
                                .user(user)
                                .storeId(storeId)
                                .status(ReturnRequest.ReturnStatus.RETURN_REJECTED)
                                .adminFinalized(true)
                                .items(List.of())
                                .build();

                when(returnRequestRepository.findById(returnId)).thenReturn(Optional.of(request));

                ResponseStatusException ex = assertThrows(
                                ResponseStatusException.class,
                                () -> returnRequestService.sellerDisputeReturn(returnId, storeId, "I want to dispute",
                                                "https://example.com/evidence.jpg", "vendor@local"));

                assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
                assertTrue(ex.getReason().contains("Invalid status transition"));
        }

        @Test
        void sellerDisputeReturnsEvidenceUrlForAdminReview() {
                UUID returnId = UUID.randomUUID();
                UUID storeId = UUID.randomUUID();
                String evidenceUrl = "/uploads/returns/vendor-proof.jpg";

                User user = buildUser(UUID.randomUUID());
                Order order = buildOrder(UUID.randomUUID(), user, Order.OrderStatus.DELIVERED, List.of());
                ReturnRequest request = ReturnRequest.builder()
                                .id(returnId)
                                .order(order)
                                .user(user)
                                .storeId(storeId)
                                .status(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER)
                                .items(List.of())
                                .build();

                when(returnRequestRepository.findById(returnId)).thenReturn(Optional.of(request));
                when(returnRequestRepository.save(any(ReturnRequest.class)))
                                .thenAnswer(invocation -> invocation.getArgument(0));

                ReturnRequestResponse response = returnRequestService.sellerDisputeReturn(
                                returnId,
                                storeId,
                                "Customer returned a different item",
                                evidenceUrl,
                                "vendor@local");

                assertEquals(ReturnRequest.ReturnStatus.DISPUTING, response.getStatus());
                assertEquals("Customer returned a different item", response.getDisputeReason());
                assertEquals(evidenceUrl, response.getDisputeEvidenceUrl());
        }

        @Test
        void adminRequestAdditionalEvidenceCreatesTimelineEntry() {
                UUID returnId = UUID.randomUUID();
                UUID adminId = UUID.randomUUID();
                User user = buildUser(UUID.randomUUID());
                Order order = buildOrder(UUID.randomUUID(), user, Order.OrderStatus.DELIVERED, List.of());
                ReturnRequest request = ReturnRequest.builder()
                                .id(returnId)
                                .order(order)
                                .user(user)
                                .status(ReturnRequest.ReturnStatus.DISPUTING)
                                .items(List.of())
                                .adminFinalized(false)
                                .build();
                List<ReturnEvidenceRequest> evidenceRequests = new ArrayList<>();

                when(returnRequestRepository.findById(returnId)).thenReturn(Optional.of(request));
                when(returnEvidenceRequestRepository.save(any(ReturnEvidenceRequest.class)))
                                .thenAnswer(invocation -> {
                                        ReturnEvidenceRequest saved = invocation.getArgument(0);
                                        saved.setId(UUID.randomUUID());
                                        saved.setEvidence(new ArrayList<>());
                                        evidenceRequests.add(saved);
                                        return saved;
                                });
                when(returnEvidenceRequestRepository.findByReturnRequestIdOrderByCreatedAtAsc(returnId))
                                .thenAnswer(invocation -> evidenceRequests);

                ReturnRequestResponse response = returnRequestService.requestAdditionalEvidence(
                                returnId,
                                "Vui lòng bổ sung ảnh kiện hàng và biên bản giao nhận",
                                adminId,
                                "admin@local");

                assertEquals(1, response.getAdditionalEvidenceRequests().size());
                ReturnRequestResponse.AdditionalEvidenceRequest evidenceRequest = response
                                .getAdditionalEvidenceRequests()
                                .getFirst();
                assertEquals("Vui lòng bổ sung ảnh kiện hàng và biên bản giao nhận",
                                evidenceRequest.getMessage());
                assertEquals("admin@local", evidenceRequest.getRequestedBy());
                assertTrue(evidenceRequest.getEvidence().isEmpty());
        }

        @Test
        void customerSubmitsAdditionalEvidenceForOwnReturn() {
                UUID returnId = UUID.randomUUID();
                UUID requestId = UUID.randomUUID();
                UUID userId = UUID.randomUUID();
                String evidenceUrl = "/uploads/returns/customer-extra.jpg";
                User user = buildUser(userId);
                Order order = buildOrder(UUID.randomUUID(), user, Order.OrderStatus.DELIVERED, List.of());
                ReturnRequest request = ReturnRequest.builder()
                                .id(returnId)
                                .order(order)
                                .user(user)
                                .status(ReturnRequest.ReturnStatus.DISPUTING)
                                .items(List.of())
                                .adminFinalized(false)
                                .build();
                ReturnEvidenceRequest evidenceRequest = ReturnEvidenceRequest.builder()
                                .id(requestId)
                                .returnRequest(request)
                                .message("Bổ sung bằng chứng")
                                .evidence(new ArrayList<>())
                                .build();

                when(returnRequestRepository.findById(returnId)).thenReturn(Optional.of(request));
                when(returnEvidenceRequestRepository.findById(requestId)).thenReturn(Optional.of(evidenceRequest));
                when(returnAdditionalEvidenceRepository.existsByEvidenceRequestIdAndSubmittedByRole(
                                requestId,
                                ReturnAdditionalEvidence.EvidenceActor.CUSTOMER)).thenReturn(false);
                when(returnAdditionalEvidenceRepository.save(any(ReturnAdditionalEvidence.class)))
                                .thenAnswer(invocation -> {
                                        ReturnAdditionalEvidence saved = invocation.getArgument(0);
                                        saved.setId(UUID.randomUUID());
                                        evidenceRequest.getEvidence().add(saved);
                                        return saved;
                                });
                when(returnEvidenceRequestRepository.findByReturnRequestIdOrderByCreatedAtAsc(returnId))
                                .thenReturn(List.of(evidenceRequest));

                ReturnRequestResponse response = returnRequestService.submitAdditionalEvidence(
                                returnId,
                                requestId,
                                userId,
                                "buyer@example.com",
                                User.Role.CUSTOMER,
                                null,
                                "Ảnh chụp kiện hàng sau khi mở",
                                evidenceUrl);

                ReturnRequestResponse.AdditionalEvidence evidence = response
                                .getAdditionalEvidenceRequests()
                                .getFirst()
                                .getEvidence()
                                .getFirst();
                assertEquals("CUSTOMER", evidence.getSubmittedByRole());
                assertEquals(userId, evidence.getSubmittedByUserId());
                assertEquals("buyer@example.com", evidence.getSubmittedByEmail());
                assertEquals("Ảnh chụp kiện hàng sau khi mở", evidence.getNote());
                assertEquals(evidenceUrl, evidence.getEvidenceUrl());
        }

        @Test
        void vendorCannotSubmitAdditionalEvidenceForAnotherStore() {
                UUID returnId = UUID.randomUUID();
                UUID requestId = UUID.randomUUID();
                UUID ownerStoreId = UUID.randomUUID();
                UUID otherStoreId = UUID.randomUUID();
                User user = buildUser(UUID.randomUUID());
                Order order = buildOrder(UUID.randomUUID(), user, Order.OrderStatus.DELIVERED, List.of());
                ReturnRequest request = ReturnRequest.builder()
                                .id(returnId)
                                .order(order)
                                .user(user)
                                .storeId(ownerStoreId)
                                .status(ReturnRequest.ReturnStatus.DISPUTING)
                                .items(List.of())
                                .adminFinalized(false)
                                .build();
                ReturnEvidenceRequest evidenceRequest = ReturnEvidenceRequest.builder()
                                .id(requestId)
                                .returnRequest(request)
                                .message("Bổ sung bằng chứng")
                                .evidence(new ArrayList<>())
                                .build();

                when(returnRequestRepository.findById(returnId)).thenReturn(Optional.of(request));
                when(returnEvidenceRequestRepository.findById(requestId)).thenReturn(Optional.of(evidenceRequest));

                ResponseStatusException ex = assertThrows(
                                ResponseStatusException.class,
                                () -> returnRequestService.submitAdditionalEvidence(
                                                returnId,
                                                requestId,
                                                UUID.randomUUID(),
                                                "vendor@local",
                                                User.Role.VENDOR,
                                                otherStoreId,
                                                "Ảnh kiểm hàng",
                                                "/uploads/returns/vendor-extra.jpg"));

                assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                assertEquals("Return request does not belong to your store", ex.getReason());
        }

        @Test
        void finalVerdictReleaseToVendorMarksCaseAsAdminFinalized() {
                UUID returnId = UUID.randomUUID();
                UUID userId = UUID.randomUUID();

                User user = buildUser(userId);
                Order order = buildOrder(UUID.randomUUID(), user, Order.OrderStatus.DELIVERED, List.of());
                ReturnRequest disputedRequest = ReturnRequest.builder()
                                .id(returnId)
                                .order(order)
                                .user(user)
                                .status(ReturnRequest.ReturnStatus.DISPUTING)
                                .items(List.of())
                                .build();

                when(returnRequestRepository.findById(returnId)).thenReturn(Optional.of(disputedRequest));
                when(returnRequestRepository.save(any(ReturnRequest.class)))
                                .thenAnswer(invocation -> invocation.getArgument(0));

                ReturnRequestResponse response = returnRequestService.adminResolveDispute(
                                returnId,
                                "seller",
                                "Final verdict: release to vendor",
                                UUID.randomUUID(),
                                "admin@local");

                assertEquals(ReturnRequest.ReturnStatus.RETURN_REJECTED, response.getStatus());
                assertEquals("Final verdict: release to vendor", response.getAdminNote());

                ArgumentCaptor<ReturnRequest> captor = ArgumentCaptor.forClass(ReturnRequest.class);
                verify(returnRequestRepository).save(captor.capture());
                assertTrue(Boolean.TRUE.equals(captor.getValue().getAdminFinalized()));
                assertEquals(0, recordingWalletService.getRefundCallCount());
        }

        @Test
        void confirmReceiptDebitsVendorBeforeCreditingCustomer() {
                UUID returnId = UUID.randomUUID();
                UUID userId = UUID.randomUUID();
                UUID storeId = UUID.randomUUID();

                User user = buildUser(userId);
                Order order = buildOrder(UUID.randomUUID(), user, Order.OrderStatus.DELIVERED, List.of());
                ReturnRequest request = ReturnRequest.builder()
                                .id(returnId)
                                .order(order)
                                .user(user)
                                .storeId(storeId)
                                .status(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER)
                                .items(List.of(new ReturnRequest.ReturnItemSnapshot(
                                                UUID.randomUUID(),
                                                "Polo Shirt",
                                                "M",
                                                "https://example.com/item.jpg",
                                                null,
                                                1,
                                                new BigDecimal("120000"))))
                                .build();

                when(returnRequestRepository.findById(returnId)).thenReturn(Optional.of(request));
                when(returnRequestRepository.save(any(ReturnRequest.class)))
                                .thenAnswer(invocation -> invocation.getArgument(0));

                ReturnRequestResponse response = returnRequestService.sellerApproveReturn(returnId, storeId,
                                "vendor@local");

                assertEquals(ReturnRequest.ReturnStatus.REFUND_SUCCESS, response.getStatus());
                assertEquals(List.of("debit", "refund"), recordingWalletService.getCallSequence());
        }

        @Test
        void confirmReceiptCalculatesRefundFromNetPaidAmountPerItem() {
                UUID returnId = UUID.randomUUID();
                UUID userId = UUID.randomUUID();
                UUID storeId = UUID.randomUUID();

                User user = buildUser(userId);
                OrderItem itemA = buildOrderItem(UUID.randomUUID(), storeId, 1, new BigDecimal("100000"));
                OrderItem itemB = buildOrderItem(UUID.randomUUID(), storeId, 1, new BigDecimal("100000"));
                Order order = buildOrder(UUID.randomUUID(), user, Order.OrderStatus.DELIVERED, List.of(itemA, itemB));
                order.setSubtotal(new BigDecimal("200000"));
                order.setShippingFee(new BigDecimal("20000"));
                order.setDiscount(new BigDecimal("20000"));
                order.setTotal(new BigDecimal("200000"));

                ReturnRequest request = ReturnRequest.builder()
                                .id(returnId)
                                .order(order)
                                .user(user)
                                .storeId(storeId)
                                .status(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER)
                                .items(List.of(new ReturnRequest.ReturnItemSnapshot(
                                                itemA.getId(),
                                                itemA.getProductName(),
                                                itemA.getVariantName(),
                                                itemA.getProductImage(),
                                                null,
                                                1,
                                                itemA.getUnitPrice())))
                                .build();

                when(returnRequestRepository.findById(returnId)).thenReturn(Optional.of(request));
                when(returnRequestRepository.save(any(ReturnRequest.class)))
                                .thenAnswer(invocation -> invocation.getArgument(0));

                ReturnRequestResponse response = returnRequestService.sellerApproveReturn(returnId, storeId,
                                "vendor@local");

                assertEquals(0, response.getRefundAmount().compareTo(new BigDecimal("90000.00")));
        }

        @Test
        void confirmReceiptCalculatesPartialQuantityRefundFromNetLineAmount() {
                UUID returnId = UUID.randomUUID();
                UUID userId = UUID.randomUUID();
                UUID storeId = UUID.randomUUID();

                User user = buildUser(userId);
                OrderItem item = buildOrderItem(UUID.randomUUID(), storeId, 3, new BigDecimal("100000"));
                Order order = buildOrder(UUID.randomUUID(), user, Order.OrderStatus.DELIVERED, List.of(item));
                order.setSubtotal(new BigDecimal("300000"));
                order.setShippingFee(BigDecimal.ZERO);
                order.setDiscount(new BigDecimal("30000"));
                order.setTotal(new BigDecimal("270000"));

                ReturnRequest request = ReturnRequest.builder()
                                .id(returnId)
                                .order(order)
                                .user(user)
                                .storeId(storeId)
                                .status(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER)
                                .items(List.of(new ReturnRequest.ReturnItemSnapshot(
                                                item.getId(),
                                                item.getProductName(),
                                                item.getVariantName(),
                                                item.getProductImage(),
                                                null,
                                                1,
                                                item.getUnitPrice())))
                                .build();

                when(returnRequestRepository.findById(returnId)).thenReturn(Optional.of(request));
                when(returnRequestRepository.save(any(ReturnRequest.class)))
                                .thenAnswer(invocation -> invocation.getArgument(0));

                ReturnRequestResponse response = returnRequestService.sellerApproveReturn(returnId, storeId,
                                "vendor@local");

                assertEquals(0, response.getRefundAmount().compareTo(new BigDecimal("90000.00")));
        }

        private User buildUser(UUID userId) {
                return User.builder()
                                .id(userId)
                                .email("buyer@example.com")
                                .password("secret")
                                .name("Buyer")
                                .build();
        }

        private Order buildOrder(UUID orderId, User user, Order.OrderStatus status, List<OrderItem> items) {
                Order order = Order.builder()
                                .id(orderId)
                                .user(user)
                                .status(status)
                                .subtotal(new BigDecimal("240000"))
                                .shippingFee(new BigDecimal("20000"))
                                .discount(BigDecimal.ZERO)
                                .total(new BigDecimal("260000"))
                                .paymentMethod(Order.PaymentMethod.COD)
                                .paymentStatus(Order.PaymentStatus.UNPAID)
                                .items(items)
                                .escrowDeadlineAt(
                                                status == Order.OrderStatus.DELIVERED ? LocalDateTime.now().plusDays(7)
                                                                : null)
                                .build();
                items.forEach(item -> item.setOrder(order));
                return order;
        }

        private OrderItem buildOrderItem(UUID orderItemId, UUID storeId, int quantity, BigDecimal unitPrice) {
                return OrderItem.builder()
                                .id(orderItemId)
                                .productName("Polo Shirt")
                                .variantName("M")
                                .productImage("https://example.com/item.jpg")
                                .quantity(quantity)
                                .unitPrice(unitPrice)
                                .totalPrice(unitPrice.multiply(BigDecimal.valueOf(quantity)))
                                .storeId(storeId)
                                .build();
        }

        private ReturnSubmitRequest buildSubmitPayload(UUID orderId,
                        List<ReturnSubmitRequest.ReturnItemPayload> items) {
                ReturnSubmitRequest payload = new ReturnSubmitRequest();
                payload.setOrderId(orderId);
                payload.setReason(ReturnRequest.ReturnReason.SIZE);
                payload.setResolution(ReturnRequest.ReturnResolution.REFUND);
                payload.setItems(items);
                return payload;
        }

        private ReturnSubmitRequest.ReturnItemPayload buildItemPayload(UUID orderItemId, int quantity) {
                ReturnSubmitRequest.ReturnItemPayload payload = new ReturnSubmitRequest.ReturnItemPayload();
                payload.setOrderItemId(orderItemId);
                payload.setQuantity(quantity);
                payload.setEvidenceUrl("https://example.com/evidence.jpg");
                return payload;
        }

        private static final class FixedPublicCodeService extends PublicCodeService {
                private FixedPublicCodeService() {
                        super(null, null, null, null);
                }

                @Override
                public String nextReturnCode() {
                        return "RT-TEST-000001";
                }
        }

        private static final class RecordingWalletService extends WalletService {
                private int refundCallCount = 0;
                private final List<UUID> returnRequestIds = new ArrayList<>();
                private final List<String> callSequence = new ArrayList<>();

                private RecordingWalletService() {
                        super(null, null, null, null, null, null, null);
                }

                @Override
                public void debitVendorForReturnRefund(UUID returnRequestId, Order order, BigDecimal refundAmount,
                                String reason) {
                        callSequence.add("debit");
                }

                @Override
                public void refundToCustomerFromEscrow(UUID returnRequestId, Order order, BigDecimal refundAmount,
                                String reason) {
                        callSequence.add("refund");
                        refundCallCount++;
                        returnRequestIds.add(returnRequestId);
                }

                private int getRefundCallCount() {
                        return refundCallCount;
                }

                private List<String> getCallSequence() {
                        return callSequence;
                }
        }
}
