package vn.edu.hcmuaf.fit.marketplace.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.dto.request.ReturnAdminVerdictRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.request.ReturnSubmitRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.ReturnRequestResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorReturnSummaryResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Notification;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.OrderItem;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnAdditionalEvidence;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnEvidenceRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnAdditionalEvidenceRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnEvidenceRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ReturnRequestService {
    private static final Logger log = LoggerFactory.getLogger(ReturnRequestService.class);
    private static final String MOCK_REVERSE_CARRIER = "MOCK_REVERSE_SHIPPER";
    private static final String SYSTEM_REVERSE_LOGISTICS = "SYSTEM_REVERSE_LOGISTICS";

    private final ReturnRequestRepository returnRequestRepository;
    private final OrderRepository orderRepository;
    private final StoreRepository storeRepository;
    private final PublicCodeService publicCodeService;
    private final WalletService walletService;
    private final AdminAuditLogService adminAuditLogService;
    private final NotificationDomainService notificationDomainService;
    private final ReturnEvidenceRequestRepository returnEvidenceRequestRepository;
    private final ReturnAdditionalEvidenceRepository returnAdditionalEvidenceRepository;

    @Autowired
    public ReturnRequestService(
            ReturnRequestRepository returnRequestRepository,
            OrderRepository orderRepository,
            StoreRepository storeRepository,
            PublicCodeService publicCodeService,
            WalletService walletService,
            AdminAuditLogService adminAuditLogService,
            NotificationDomainService notificationDomainService,
            ReturnEvidenceRequestRepository returnEvidenceRequestRepository,
            ReturnAdditionalEvidenceRepository returnAdditionalEvidenceRepository) {
        this.returnRequestRepository = returnRequestRepository;
        this.orderRepository = orderRepository;
        this.storeRepository = storeRepository;
        this.publicCodeService = publicCodeService;
        this.walletService = walletService;
        this.adminAuditLogService = adminAuditLogService;
        this.notificationDomainService = notificationDomainService;
        this.returnEvidenceRequestRepository = returnEvidenceRequestRepository;
        this.returnAdditionalEvidenceRepository = returnAdditionalEvidenceRepository;
    }

    public ReturnRequestService(
            ReturnRequestRepository returnRequestRepository,
            OrderRepository orderRepository,
            StoreRepository storeRepository,
            PublicCodeService publicCodeService,
            WalletService walletService) {
        this(
                returnRequestRepository,
                orderRepository,
                storeRepository,
                publicCodeService,
                walletService,
                null,
                null,
                null,
                null);
    }

    @Transactional
    public ReturnRequestResponse submit(UUID userId, ReturnSubmitRequest payload) {
        if (payload == null || payload.getOrderId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order is required");
        }

        Order order = orderRepository.findById(payload.getOrderId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));

        if (order.getUser() == null || !order.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Order does not belong to user");
        }
        if (order.getStatus() != Order.OrderStatus.DELIVERED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Returns are only allowed for delivered orders");
        }

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime deadline = order.getEscrowDeadlineAt();
        if (deadline == null || !deadline.isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Escrow period has expired or order is completed");
        }

        long remainingSeconds = Duration.between(now, deadline).toSeconds();
        if (remainingSeconds <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escrow period has expired");
        }
        if (payload.getItems() == null || payload.getItems().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Return request must include at least one item");
        }
        if (!hasCustomerEvidence(payload)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Return evidence is required");
        }

        // Ensure no duplicates in request payload and match whole order
        if (payload.getItems() != null) {
            Set<UUID> duplicateItemCheck = new java.util.HashSet<>();
            Set<UUID> orderItemIds = order.getItems().stream().map(OrderItem::getId).collect(Collectors.toSet());
            for (ReturnSubmitRequest.ReturnItemPayload item : payload.getItems()) {
                if (item.getOrderItemId() == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OrderItem ID is required");
                }
                if (!orderItemIds.contains(item.getOrderItemId())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Item does not belong to this order");
                }
                if (!duplicateItemCheck.add(item.getOrderItemId())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate order item in return request");
                }
            }
            if (duplicateItemCheck.size() != order.getItems().size()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Must return all items in the order");
            }
        }

        // Check for active open returns on these items to prevent conflicts
        Set<UUID> requestedOrderItemIds = order.getItems().stream()
                .map(OrderItem::getId)
                .collect(Collectors.toSet());
        assertNoOpenReturnConflict(order.getId(), requestedOrderItemIds);

        // Pause 7-day escrow timer
        order.setEscrowRemainingSeconds(remainingSeconds);
        order.setEscrowDeadlineAt(null);
        order.setStatus(Order.OrderStatus.RETURNING);
        orderRepository.save(order);

        // Whole-order return logic: automatically construct ReturnItemSnapshot for all
        // items in the order
        List<ReturnRequest.ReturnItemSnapshot> snapshots = order.getItems().stream().map(orderItem -> {
            String evidenceUrl = null;
            if (payload.getItems() != null) {
                evidenceUrl = payload.getItems().stream()
                        .filter(i -> i != null && orderItem.getId().equals(i.getOrderItemId()))
                        .map(i -> normalizeOptionalText(i.getEvidenceUrl()))
                        .filter(url -> !url.isEmpty())
                        .findFirst()
                        .orElse(null);
                if (evidenceUrl == null) {
                    evidenceUrl = payload.getItems().stream()
                            .filter(i -> i != null && orderItem.getId().equals(i.getOrderItemId()))
                            .map(i -> normalizeOptionalText(i.getAdminImageUrl()))
                            .filter(url -> !url.isEmpty())
                            .findFirst()
                            .orElse(null);
                }
            }
            return new ReturnRequest.ReturnItemSnapshot(
                    orderItem.getId(),
                    orderItem.getProductName(),
                    orderItem.getVariantName(),
                    orderItem.getProductImage(),
                    evidenceUrl,
                    orderItem.getQuantity(),
                    safeAmount(orderItem.getUnitPrice()));
        }).toList();

        UUID storeId = order.getStoreId();
        if (storeId == null && !snapshots.isEmpty()) {
            Map<UUID, OrderItem> orderItemMap = order.getItems().stream()
                    .collect(Collectors.toMap(OrderItem::getId, oi -> oi));
            storeId = resolveSingleStoreId(snapshots, orderItemMap);
        }

        String returnCode = publicCodeService.nextReturnCode();
        ReturnRequest request = ReturnRequest.builder()
                .returnCode(returnCode)
                .order(order)
                .user(order.getUser())
                .storeId(storeId)
                .reason(payload.getReason())
                .note(payload.getNote())
                .resolution(payload.getResolution())
                .status(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER)
                .shippingTrackingNumber(buildMockTrackingNumber(returnCode))
                .shippingCarrier(MOCK_REVERSE_CARRIER)
                .shippedAt(LocalDateTime.now())
                .receivedAt(LocalDateTime.now())
                .items(snapshots)
                .adminFinalized(false)
                .updatedBy(userId.toString())
                .build();

        ReturnRequest saved = returnRequestRepository.save(request);
        notifyCustomerReturnCreated(saved);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public Page<ReturnRequestResponse> list(ReturnRequest.ReturnStatus status, Pageable pageable) {
        return list(
                status == null ? null : List.of(status),
                null,
                pageable);
    }

    @Transactional(readOnly = true)
    public Page<ReturnRequestResponse> list(
            List<ReturnRequest.ReturnStatus> statuses,
            String keyword,
            Pageable pageable) {
        Page<ReturnRequest> page = returnRequestRepository.findAll(
                buildListSpecification(null, statuses, keyword),
                pageable);
        return page.map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public Page<ReturnRequestResponse> listForVendor(UUID storeId, ReturnRequest.ReturnStatus status,
            Pageable pageable) {
        return listForVendor(
                storeId,
                status == null ? null : List.of(status),
                null,
                pageable);
    }

    @Transactional(readOnly = true)
    public Page<ReturnRequestResponse> listForVendor(
            UUID storeId,
            List<ReturnRequest.ReturnStatus> statuses,
            String keyword,
            Pageable pageable) {
        if (storeId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Store is required");
        }
        Page<ReturnRequest> page = returnRequestRepository.findAll(
                buildListSpecification(storeId, statuses, keyword),
                pageable);
        return page.map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public VendorReturnSummaryResponse getVendorSummary(UUID storeId) {
        if (storeId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Store is required");
        }

        Map<ReturnRequest.ReturnStatus, Long> countsByStatus = returnRequestRepository
                .countGroupedByStatusForStore(storeId)
                .stream()
                .collect(Collectors.toMap(
                        ReturnRequestRepository.ReturnStatusCountProjection::getStatus,
                        ReturnRequestRepository.ReturnStatusCountProjection::getTotal));

        long total = countsByStatus.values().stream().mapToLong(Long::longValue).sum();
        long requested = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.REQUESTED, 0L);
        long inTransit = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.IN_TRANSIT, 0L);
        long deliveredToSeller = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER, 0L);
        long disputing = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.DISPUTING, 0L);
        long refundSuccess = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.REFUND_SUCCESS, 0L);
        long returnRejected = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.RETURN_REJECTED, 0L);
        long cancelled = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.CANCELLED, 0L);

        return VendorReturnSummaryResponse.builder()
                .all(total)
                .needsAction(deliveredToSeller) // Only DELIVERED_TO_SELLER requires action within 48h
                .inTransit(requested + inTransit) // Items on the way back to vendor
                .toInspect(deliveredToSeller) // Items waiting for vendor decision
                .disputed(disputing) // Items in dispute requiring admin
                .completed(refundSuccess + returnRejected + cancelled) // All finalized returns
                .build();
    }

    @Transactional(readOnly = true)
    public ReturnRequestResponse get(UUID id) {
        return toResponse(findById(id));
    }

    @Transactional(readOnly = true)
    public ReturnRequestResponse getByCode(String code) {
        ReturnRequest request = returnRequestRepository.findByReturnCode(code)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Return request not found"));
        return toResponse(request);
    }

    @Transactional
    public ReturnRequestResponse mockPickupReturn(UUID returnId) {
        return mockPickupReturn(returnId, SYSTEM_REVERSE_LOGISTICS);
    }

    @Transactional
    public ReturnRequestResponse mockPickupReturn(UUID returnId, String actor) {
        ReturnRequest request = findById(returnId);
        assertStatus(request, ReturnRequest.ReturnStatus.REQUESTED);

        request.setStatus(ReturnRequest.ReturnStatus.IN_TRANSIT);
        request.setShippedAt(LocalDateTime.now());
        request.setUpdatedBy(actor);
        ReturnRequest saved = returnRequestRepository.save(request);

        notifyCustomerReturnStatusChanged(saved);
        return toResponse(saved);
    }

    @Transactional
    public ReturnRequestResponse mockDeliverReturnToSeller(UUID returnId) {
        return mockDeliverReturnToSeller(returnId, SYSTEM_REVERSE_LOGISTICS);
    }

    @Transactional
    public ReturnRequestResponse mockDeliverReturnToSeller(UUID returnId, String actor) {
        ReturnRequest request = findById(returnId);
        assertStatus(request, ReturnRequest.ReturnStatus.IN_TRANSIT);

        request.setStatus(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER);
        request.setReceivedAt(LocalDateTime.now());
        // Seller has 48 hours to approve or dispute the return
        // If no action taken, system will auto-approve refund to customer
        request.setSellerDeadlineAt(LocalDateTime.now().plusHours(48));
        request.setUpdatedBy(actor);
        ReturnRequest saved = returnRequestRepository.save(request);

        notifyCustomerReturnStatusChanged(saved);
        return toResponse(saved);
    }

    @Transactional
    public ReturnRequestResponse sellerApproveReturn(UUID returnId, UUID storeId, String actor) {
        ReturnRequest request = findById(returnId);
        assertStoreOwnership(request, storeId);

        // Seller can approve after requested, in-transit, or delivered to seller
        if (!isOpenStatus(request.getStatus()) || request.getStatus() == ReturnRequest.ReturnStatus.DISPUTING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Return can only be approved when requested, in transit or delivered to seller");
        }

        BigDecimal refundAmount = calculateRefundAmount(request);
        if (refundAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Refund amount must be greater than zero");
        }

        request.setStatus(ReturnRequest.ReturnStatus.REFUND_SUCCESS);
        request.setCompletedAt(LocalDateTime.now());
        request.setUpdatedBy(actor);
        ReturnRequest saved = returnRequestRepository.save(request);

        walletService.debitVendorForReturnRefund(
                saved.getId(),
                saved.getOrder(),
                refundAmount,
                "Vendor debit for return " + resolveReturnCode(saved));
        walletService.refundToCustomerFromEscrow(
                saved.getId(),
                saved.getOrder(),
                refundAmount,
                "Refund for return " + resolveReturnCode(saved));
        walletService.refundCommissionToVendor(
                saved.getId(),
                saved.getOrder());

        Order order = saved.getOrder();
        order.setPaymentStatus(Order.PaymentStatus.REFUNDED);
        order.setStatus(Order.OrderStatus.CANCELLED);
        orderRepository.save(order);

        notifyCustomerReturnStatusChanged(saved);
        return toResponse(saved);
    }

    @Transactional
    public ReturnRequestResponse sellerDisputeReturn(UUID returnId, UUID storeId, String disputeReason,
            String disputeEvidenceUrl, String actor) {
        String normalizedReason = normalizeRequiredText(disputeReason, "Dispute reason is required");
        String normalizedEvidenceUrl = normalizeRequiredText(disputeEvidenceUrl, "Dispute evidence is required");
        ReturnRequest request = findById(returnId);
        assertStoreOwnership(request, storeId);

        if (!isOpenStatus(request.getStatus()) || request.getStatus() == ReturnRequest.ReturnStatus.DISPUTING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid status transition: Return can only be disputed when requested, in transit or delivered to seller");
        }

        request.setStatus(ReturnRequest.ReturnStatus.DISPUTING);
        request.setDisputeReason(normalizedReason);
        request.setDisputeEvidenceUrl(normalizedEvidenceUrl);
        request.setAdminFinalized(false);
        request.setUpdatedBy(actor);
        ReturnRequest saved = returnRequestRepository.save(request);

        notifyCustomerReturnStatusChanged(saved);
        return toResponse(saved);
    }

    @Transactional
    public ReturnRequestResponse openDispute(UUID returnId, UUID userId, String reason, String actor) {
        String normalizedReason = normalizeRequiredText(reason, "Dispute reason is required");
        ReturnRequest request = findById(returnId);
        assertCustomerOwnership(request, userId);

        if (Boolean.TRUE.equals(request.getAdminFinalized())) {
            throw new IllegalArgumentException("Cannot dispute a finalized return request");
        }
        if (request.getStatus() != ReturnRequest.ReturnStatus.RETURN_REJECTED
                && request.getStatus() != ReturnRequest.ReturnStatus.DISPUTING) {
            throw new IllegalArgumentException("Can only dispute a rejected return request");
        }

        request.setStatus(ReturnRequest.ReturnStatus.DISPUTING);
        request.setDisputeReason(normalizedReason);
        request.setUpdatedBy(actor);
        ReturnRequest saved = returnRequestRepository.save(request);

        notifyCustomerReturnStatusChanged(saved);
        return toResponse(saved);
    }

    @Transactional
    public ReturnRequestResponse requestAdditionalEvidence(
            UUID returnId,
            String message,
            UUID adminId,
            String adminEmail) {
        if (returnEvidenceRequestRepository == null) {
            throw new IllegalStateException("Return evidence request repository is not configured");
        }
        String normalizedMessage = normalizeRequiredText(message, "Evidence request message is required");
        ReturnRequest request = findById(returnId);
        if (request.getStatus() != ReturnRequest.ReturnStatus.DISPUTING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Additional evidence can only be requested for disputed returns");
        }
        if (Boolean.TRUE.equals(request.getAdminFinalized())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cannot request additional evidence for a finalized return");
        }

        ReturnEvidenceRequest evidenceRequest = ReturnEvidenceRequest.builder()
                .returnRequest(request)
                .message(normalizedMessage)
                .requestedBy(normalizeOptionalText(adminEmail).isEmpty()
                        ? String.valueOf(adminId)
                        : normalizeOptionalText(adminEmail))
                .build();
        returnEvidenceRequestRepository.save(evidenceRequest);
        return toResponse(request);
    }

    @Transactional
    public ReturnRequestResponse submitAdditionalEvidence(
            UUID returnId,
            UUID evidenceRequestId,
            UUID userId,
            String userEmail,
            User.Role role,
            UUID storeId,
            String note,
            String evidenceUrl) {
        if (returnEvidenceRequestRepository == null || returnAdditionalEvidenceRepository == null) {
            throw new IllegalStateException("Return evidence repositories are not configured");
        }
        if (evidenceRequestId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Evidence request is required");
        }

        String normalizedNote = normalizeRequiredText(note, "Evidence note is required");
        String normalizedEvidenceUrl = normalizeRequiredText(evidenceUrl, "Evidence URL is required");
        ReturnRequest request = findById(returnId);
        if (request.getStatus() != ReturnRequest.ReturnStatus.DISPUTING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Additional evidence can only be submitted for disputed returns");
        }
        if (Boolean.TRUE.equals(request.getAdminFinalized())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cannot submit evidence for a finalized return");
        }

        ReturnEvidenceRequest evidenceRequest = returnEvidenceRequestRepository.findById(evidenceRequestId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Evidence request not found"));
        if (evidenceRequest.getReturnRequest() == null || evidenceRequest.getReturnRequest().getId() == null
                || !evidenceRequest.getReturnRequest().getId().equals(returnId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Evidence request does not belong to this return");
        }

        ReturnAdditionalEvidence.EvidenceActor actor = resolveEvidenceActor(request, userId, role, storeId);
        if (returnAdditionalEvidenceRepository.existsByEvidenceRequestIdAndSubmittedByRole(evidenceRequestId, actor)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This side has already submitted evidence for this request");
        }

        ReturnAdditionalEvidence additionalEvidence = ReturnAdditionalEvidence.builder()
                .evidenceRequest(evidenceRequest)
                .returnRequest(request)
                .submittedByRole(actor)
                .submittedByUserId(userId)
                .submittedByEmail(normalizeOptionalText(userEmail))
                .note(normalizedNote)
                .evidenceUrl(normalizedEvidenceUrl)
                .build();
        ReturnAdditionalEvidence saved = returnAdditionalEvidenceRepository.save(additionalEvidence);
        if (evidenceRequest.getEvidence() != null) {
            evidenceRequest.getEvidence().add(saved);
        }
        return toResponse(request);
    }

    @Transactional
    public ReturnRequestResponse cancelReturnByCustomer(UUID returnId, UUID userId, String actor) {
        ReturnRequest request = findById(returnId);
        assertCustomerOwnership(request, userId);
        assertOpenReturnCanBeCancelled(request);

        request.setStatus(ReturnRequest.ReturnStatus.CANCELLED);
        request.setUpdatedBy(actor);
        ReturnRequest saved = returnRequestRepository.save(request);

        Order order = saved.getOrder();
        order.setStatus(Order.OrderStatus.DELIVERED);
        if (order.getEscrowRemainingSeconds() != null) {
            order.setEscrowDeadlineAt(LocalDateTime.now().plusSeconds(order.getEscrowRemainingSeconds()));
        } else {
            order.setEscrowDeadlineAt(LocalDateTime.now().plusDays(7));
        }
        order.setEscrowRemainingSeconds(null);
        orderRepository.save(order);

        notifyCustomerReturnStatusChanged(saved);
        return toResponse(saved);
    }

    @Transactional
    public ReturnRequestResponse adminResolveDispute(
            UUID returnId,
            String winner,
            String adminNote,
            UUID adminId,
            String adminEmail) {
        String normalizedWinner = normalizeRequiredText(winner, "Winner is required").toLowerCase();
        ReturnRequest request = findById(returnId);
        assertStatus(request, ReturnRequest.ReturnStatus.DISPUTING);

        try {
            if ("customer".equals(normalizedWinner)) {
                BigDecimal refundAmount = calculateRefundAmount(request);
                if (refundAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Refund amount must be greater than zero");
                }
                request.setStatus(ReturnRequest.ReturnStatus.REFUND_SUCCESS);
                request.setCompletedAt(LocalDateTime.now());
                request.setAdminNote(normalizeOptionalText(adminNote));
                request.setAdminFinalized(true);
                request.setUpdatedBy(adminEmail);
                ReturnRequest saved = returnRequestRepository.save(request);

                walletService.debitVendorForReturnRefund(
                        saved.getId(),
                        saved.getOrder(),
                        refundAmount,
                        "Admin verdict debit for return " + resolveReturnCode(saved));
                walletService.refundToCustomerFromEscrow(
                        saved.getId(),
                        saved.getOrder(),
                        refundAmount,
                        "Dispute refund for return " + resolveReturnCode(saved));
                walletService.refundCommissionToVendor(
                        saved.getId(),
                        saved.getOrder());

                Order order = saved.getOrder();
                order.setPaymentStatus(Order.PaymentStatus.REFUNDED);
                order.setStatus(Order.OrderStatus.CANCELLED);
                orderRepository.save(order);

                writeAdminAuditLog(adminId, adminEmail, "RETURN", "ADMIN_RESOLVE_DISPUTE_CUSTOMER_WIN", saved.getId(),
                        true, adminNote);
                notifyCustomerReturnStatusChanged(saved);
                return toResponse(saved);
            } else if ("seller".equals(normalizedWinner)) {
                request.setStatus(ReturnRequest.ReturnStatus.RETURN_REJECTED);
                request.setCompletedAt(LocalDateTime.now());
                request.setAdminNote(normalizeOptionalText(adminNote));
                request.setAdminFinalized(true);
                request.setUpdatedBy(adminEmail);
                ReturnRequest saved = returnRequestRepository.save(request);

                Order order = saved.getOrder();
                walletService.releaseEscrowToAvailable(order.getStoreId(), order.getId(), order.getVendorPayout());

                order.setStatus(Order.OrderStatus.DELIVERED);
                order.setEscrowDeadlineAt(null);
                order.setEscrowRemainingSeconds(null);
                orderRepository.save(order);

                writeAdminAuditLog(adminId, adminEmail, "RETURN", "ADMIN_RESOLVE_DISPUTE_SELLER_WIN", saved.getId(),
                        true, adminNote);
                notifyCustomerReturnStatusChanged(saved);
                return toResponse(saved);
            } else {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Invalid winner: must be 'seller' or 'customer'");
            }
        } catch (RuntimeException ex) {
            writeAdminAuditLog(adminId, adminEmail, "RETURN", "ADMIN_RESOLVE_DISPUTE_FAILED", returnId, false,
                    ex.getMessage());
            throw ex;
        }
    }

    private void notifyCustomerReturnCreated(ReturnRequest request) {
        if (notificationDomainService == null || request == null || request.getUser() == null
                || request.getUser().getId() == null) {
            return;
        }
        try {
            String code = resolveReturnCode(request);
            String title = "Yêu cầu #" + code + " đã được tạo";
            String message = "Yêu cầu đổi/trả của bạn đã được gửi tới người bán.";
            notificationDomainService.createAndPush(
                    request.getUser().getId(),
                    Notification.NotificationType.SYSTEM,
                    title,
                    message,
                    buildReturnDetailLink(request));
        } catch (Exception ex) {
            // Log and swallow - notification failure should not abort the main transaction
            log.error("Failed to send return creation notification for return {}: {}",
                    request.getId(), ex.getMessage(), ex);
        }
    }

    private void notifyCustomerReturnStatusChanged(ReturnRequest request) {
        if (notificationDomainService == null || request == null || request.getUser() == null
                || request.getUser().getId() == null) {
            return;
        }
        try {
            ReturnRequest.ReturnStatus status = request.getStatus();
            if (status == null) {
                return;
            }
            String code = resolveReturnCode(request);
            String title = "Yêu cầu #" + code + " " + returnStatusTitle(status);
            String message = returnStatusMessage(status);
            notificationDomainService.createAndPush(
                    request.getUser().getId(),
                    Notification.NotificationType.SYSTEM,
                    title,
                    message,
                    buildReturnDetailLink(request));
        } catch (Exception ex) {
            // Log and swallow - notification failure should not abort the main transaction
            log.error("Failed to send return status change notification for return {}: {}",
                    request.getId(), ex.getMessage(), ex);
        }
    }

    private String returnStatusTitle(ReturnRequest.ReturnStatus status) {
        return switch (status) {
            case REQUESTED -> "yêu cầu trả hàng đã được tạo";
            case IN_TRANSIT -> "yêu cầu trả hàng đang được vận chuyển";
            case DELIVERED_TO_SELLER -> "yêu cầu trả hàng đã được nhận bởi người bán";
            case REFUND_SUCCESS -> "đã hoàn tiền thành công";
            case DISPUTING -> "đang được tranh chấp";
            case RETURN_REJECTED -> "yêu cầu trả hàng bị từ chối";
            case CANCELLED -> "đã hủy yêu cầu";
        };
    }

    private String returnStatusMessage(ReturnRequest.ReturnStatus status) {
        return switch (status) {
            case REQUESTED -> "Yêu cầu trả hàng của bạn đang chờ xử lý.";
            case IN_TRANSIT -> "Kiện hàng hoàn trả đang trên đường gửi tới người bán.";
            case DELIVERED_TO_SELLER -> "Hiện tại người bán đang kiểm tra hàng.";
            case REFUND_SUCCESS -> "Tiền đã được hoàn về ví của bạn.";
            case DISPUTING -> "Hệ thống đang phân xử tranh chấp giữa bạn và người bán.";
            case RETURN_REJECTED -> "Yêu cầu trả hàng của bạn không được chấp nhận.";
            case CANCELLED -> "Yêu cầu trả hàng đã bị hủy.";
        };
    }

    private String buildReturnDetailLink(ReturnRequest request) {
        // Navigate to order detail page where user can see return request
        if (request.getOrder() != null && request.getOrder().getId() != null) {
            return "/profile/orders/" + request.getOrder().getId();
        }
        // Fallback to returns page with code
        String code = resolveReturnCode(request);
        return "/returns?code=" + code;
    }

    private ReturnRequest findById(UUID id) {
        return returnRequestRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Return request not found"));
    }

    private void assertStatus(ReturnRequest request, ReturnRequest.ReturnStatus expected) {
        if (request.getStatus() != expected) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid status transition: " + request.getStatus() + " -> " + expected);
        }
    }

    private void assertStoreOwnership(ReturnRequest request, UUID storeId) {
        UUID ownerStoreId = resolveStoreId(request);
        if (storeId == null || ownerStoreId == null || !ownerStoreId.equals(storeId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Return request does not belong to your store");
        }
    }

    private void assertCustomerOwnership(ReturnRequest request, UUID userId) {
        if (request.getUser() == null || request.getUser().getId() == null
                || !request.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Return request does not belong to this customer");
        }
    }

    private ReturnAdditionalEvidence.EvidenceActor resolveEvidenceActor(
            ReturnRequest request,
            UUID userId,
            User.Role role,
            UUID storeId) {
        if (role == User.Role.CUSTOMER) {
            assertCustomerOwnership(request, userId);
            return ReturnAdditionalEvidence.EvidenceActor.CUSTOMER;
        }
        if (role == User.Role.VENDOR) {
            assertStoreOwnership(request, storeId);
            return ReturnAdditionalEvidence.EvidenceActor.VENDOR;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Only customer or vendor accounts can submit additional evidence");
    }

    private UUID resolveSingleStoreId(List<ReturnRequest.ReturnItemSnapshot> snapshots,
            Map<UUID, OrderItem> orderItemMap) {
        UUID resolvedStoreId = null;
        for (ReturnRequest.ReturnItemSnapshot snapshot : snapshots) {
            OrderItem item = orderItemMap.get(snapshot.getOrderItemId());
            UUID itemStoreId = item != null ? item.getStoreId() : null;
            if (itemStoreId == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Return item must belong to a vendor store");
            }
            if (resolvedStoreId == null) {
                resolvedStoreId = itemStoreId;
                continue;
            }
            if (!resolvedStoreId.equals(itemStoreId)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "A return request can only include items from one vendor store");
            }
        }
        return resolvedStoreId;
    }

    private UUID resolveStoreId(ReturnRequest request) {
        if (request.getStoreId() != null) {
            return request.getStoreId();
        }
        return request.getOrder() != null ? request.getOrder().getStoreId() : null;
    }

    private void assertNoOpenReturnConflict(UUID orderId, Set<UUID> requestedOrderItemIds) {
        if (orderId == null || requestedOrderItemIds == null || requestedOrderItemIds.isEmpty()) {
            return;
        }

        List<ReturnRequest> existingRequests = returnRequestRepository.findByOrderId(orderId);
        for (ReturnRequest existing : existingRequests) {
            if (!isOpenStatus(existing.getStatus())) {
                continue;
            }
            if (existing.getItems() == null || existing.getItems().isEmpty()) {
                continue;
            }

            boolean duplicatedItem = existing.getItems().stream()
                    .map(ReturnRequest.ReturnItemSnapshot::getOrderItemId)
                    .anyMatch(requestedOrderItemIds::contains);
            if (duplicatedItem) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "One or more items already have an active return request");
            }
        }
    }

    private boolean isOpenStatus(ReturnRequest.ReturnStatus status) {
        return status == ReturnRequest.ReturnStatus.REQUESTED
                || status == ReturnRequest.ReturnStatus.IN_TRANSIT
                || status == ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER
                || status == ReturnRequest.ReturnStatus.DISPUTING;
    }

    private Specification<ReturnRequest> buildListSpecification(
            UUID storeId,
            List<ReturnRequest.ReturnStatus> statuses,
            String keyword) {
        return (root, query, cb) -> {
            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            query.distinct(true);

            if (storeId != null) {
                predicates.add(cb.equal(root.get("storeId"), storeId));
            }

            List<ReturnRequest.ReturnStatus> normalizedStatuses = normalizeStatuses(statuses);
            if (!normalizedStatuses.isEmpty()) {
                predicates.add(root.get("status").in(normalizedStatuses));
            }

            String normalizedKeyword = normalizeOptionalText(keyword).toLowerCase();
            if (!normalizedKeyword.isEmpty()) {
                String pattern = "%" + normalizedKeyword + "%";
                var orderJoin = root.join("order", jakarta.persistence.criteria.JoinType.LEFT);
                var userJoin = root.join("user", jakarta.persistence.criteria.JoinType.LEFT);

                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("returnCode")), pattern),
                        cb.like(cb.lower(orderJoin.get("orderCode")), pattern),
                        cb.like(cb.lower(userJoin.get("name")), pattern),
                        cb.like(cb.lower(userJoin.get("email")), pattern)));
            }

            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }

    private List<ReturnRequest.ReturnStatus> normalizeStatuses(List<ReturnRequest.ReturnStatus> statuses) {
        if (statuses == null || statuses.isEmpty()) {
            return List.of();
        }
        return statuses.stream()
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
    }

    private BigDecimal calculateRefundAmount(ReturnRequest request) {
        if (request == null) {
            return BigDecimal.ZERO;
        }

        List<ReturnRequest.ReturnItemSnapshot> snapshots = request.getItems() == null ? List.of() : request.getItems();
        if (snapshots.isEmpty()) {
            return BigDecimal.ZERO;
        }

        Order order = request.getOrder();
        List<OrderItem> orderItems = order == null || order.getItems() == null ? List.of() : order.getItems();
        if (orderItems.isEmpty()) {
            return calculateLegacyRefundFromSnapshots(snapshots);
        }

        Map<UUID, OrderItem> orderItemMap = orderItems.stream()
                .filter(item -> item != null && item.getId() != null)
                .collect(Collectors.toMap(OrderItem::getId, item -> item, (left, right) -> left, LinkedHashMap::new));
        if (orderItemMap.isEmpty()) {
            return calculateLegacyRefundFromSnapshots(snapshots);
        }

        BigDecimal totalGross = orderItemMap.values().stream()
                .map(item -> safeAmount(item.getTotalPrice()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalGross.compareTo(BigDecimal.ZERO) <= 0) {
            return calculateLegacyRefundFromSnapshots(snapshots);
        }

        BigDecimal totalDiscount = safeAmount(order == null ? BigDecimal.ZERO : order.getDiscount())
                .min(totalGross);
        Map<UUID, BigDecimal> allocatedDiscountByItem = allocateDiscountByOrderItem(orderItemMap, totalGross,
                totalDiscount);

        BigDecimal refund = BigDecimal.ZERO;
        for (ReturnRequest.ReturnItemSnapshot snapshot : snapshots) {
            if (snapshot == null || snapshot.getOrderItemId() == null) {
                continue;
            }

            int returnQty = Math.max(0, snapshot.getQuantity() == null ? 0 : snapshot.getQuantity());
            if (returnQty <= 0) {
                continue;
            }

            OrderItem matchedItem = orderItemMap.get(snapshot.getOrderItemId());
            if (matchedItem == null) {
                refund = refund.add(
                        safeAmount(snapshot.getUnitPrice())
                                .multiply(BigDecimal.valueOf(returnQty)));
                continue;
            }

            int orderedQty = Math.max(0, matchedItem.getQuantity() == null ? 0 : matchedItem.getQuantity());
            BigDecimal lineGross = safeAmount(matchedItem.getTotalPrice());
            if (orderedQty <= 0 || lineGross.compareTo(BigDecimal.ZERO) <= 0) {
                refund = refund.add(
                        safeAmount(snapshot.getUnitPrice())
                                .multiply(BigDecimal.valueOf(returnQty)));
                continue;
            }

            BigDecimal lineDiscount = allocatedDiscountByItem
                    .getOrDefault(matchedItem.getId(), BigDecimal.ZERO)
                    .min(lineGross);
            BigDecimal lineNet = lineGross.subtract(lineDiscount).max(BigDecimal.ZERO);

            BigDecimal lineRefund = lineNet.multiply(BigDecimal.valueOf(returnQty))
                    .divide(BigDecimal.valueOf(orderedQty), 2, RoundingMode.HALF_UP)
                    .min(lineNet);
            refund = refund.add(lineRefund);
        }

        return refund.max(BigDecimal.ZERO);
    }

    private Map<UUID, BigDecimal> allocateDiscountByOrderItem(
            Map<UUID, OrderItem> orderItemMap,
            BigDecimal totalGross,
            BigDecimal totalDiscount) {
        Map<UUID, BigDecimal> allocatedByItem = new LinkedHashMap<>();
        if (orderItemMap.isEmpty() || totalDiscount.compareTo(BigDecimal.ZERO) <= 0
                || totalGross.compareTo(BigDecimal.ZERO) <= 0) {
            return allocatedByItem;
        }

        List<OrderItem> sortedItems = new ArrayList<>(orderItemMap.values());
        sortedItems.sort(Comparator.comparing(item -> item.getId().toString()));

        BigDecimal allocated = BigDecimal.ZERO;
        int size = sortedItems.size();
        for (int i = 0; i < size; i++) {
            OrderItem orderItem = sortedItems.get(i);
            BigDecimal lineGross = safeAmount(orderItem.getTotalPrice());

            BigDecimal lineDiscount;
            if (i == size - 1) {
                lineDiscount = totalDiscount.subtract(allocated);
            } else {
                lineDiscount = totalDiscount.multiply(lineGross)
                        .divide(totalGross, 2, RoundingMode.HALF_UP);
                allocated = allocated.add(lineDiscount);
            }

            lineDiscount = lineDiscount.max(BigDecimal.ZERO).min(lineGross);
            allocatedByItem.put(orderItem.getId(), lineDiscount);
        }
        return allocatedByItem;
    }

    private BigDecimal calculateLegacyRefundFromSnapshots(List<ReturnRequest.ReturnItemSnapshot> snapshots) {
        return snapshots.stream()
                .filter(java.util.Objects::nonNull)
                .map(item -> safeAmount(item.getUnitPrice())
                        .multiply(BigDecimal.valueOf(Math.max(0, item.getQuantity() == null ? 0 : item.getQuantity()))))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private String normalizeRequiredText(String value, String message) {
        String normalized = normalizeOptionalText(value);
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return normalized;
    }

    private String normalizeOptionalText(String value) {
        return value == null ? "" : value.trim();
    }

    private BigDecimal safeAmount(BigDecimal amount) {
        return amount == null ? BigDecimal.ZERO : amount.max(BigDecimal.ZERO);
    }

    private String resolveReturnCode(ReturnRequest request) {
        return request.getReturnCode() == null || request.getReturnCode().isBlank()
                ? String.valueOf(request.getId())
                : request.getReturnCode();
    }

    private ReturnRequestResponse toResponse(ReturnRequest request) {
        UUID effectiveStoreId = resolveStoreId(request);
        String storeName = null;

        if (effectiveStoreId != null) {
            storeName = storeRepository.findById(effectiveStoreId).map(Store::getName).orElse(null);
        }

        return ReturnRequestResponse.builder()
                .id(request.getId())
                .code(request.getReturnCode())
                .orderId(request.getOrder().getId())
                .orderCode(request.getOrder().getOrderCode())
                .userId(request.getUser().getId())
                .customerName(request.getUser().getName())
                .customerEmail(request.getUser().getEmail())
                .customerPhone(request.getUser().getPhone())
                .reason(request.getReason())
                .note(request.getNote())
                .resolution(request.getResolution())
                .status(request.getStatus())
                .items(request.getItems().stream().map(item -> ReturnRequestResponse.ReturnItem.builder()
                        .orderItemId(item.getOrderItemId())
                        .productName(item.getProductName())
                        .variantName(item.getVariantName())
                        .imageUrl(item.getImageUrl())
                        .evidenceUrl(item.getEvidenceUrl())
                        .quantity(item.getQuantity())
                        .unitPrice(item.getUnitPrice())
                        .build()).toList())
                .refundAmount(calculateRefundAmount(request))
                .storeId(effectiveStoreId)
                .storeName(storeName)
                .vendorReason(request.getVendorReason())
                .disputeReason(request.getDisputeReason())
                .disputeEvidenceUrl(request.getDisputeEvidenceUrl())
                .shippingTrackingNumber(request.getShippingTrackingNumber())
                .shippingCarrier(request.getShippingCarrier())
                .adminNote(request.getAdminNote())
                .updatedBy(request.getUpdatedBy())
                .shippedAt(request.getShippedAt())
                .receivedAt(request.getReceivedAt())
                .completedAt(request.getCompletedAt())
                .createdAt(request.getCreatedAt())
                .updatedAt(request.getUpdatedAt())
                .additionalEvidenceRequests(toAdditionalEvidenceRequests(request))
                .build();
    }

    private List<ReturnRequestResponse.AdditionalEvidenceRequest> toAdditionalEvidenceRequests(
            ReturnRequest request) {
        if (request == null || request.getId() == null || returnEvidenceRequestRepository == null) {
            return List.of();
        }
        List<ReturnEvidenceRequest> requests = returnEvidenceRequestRepository
                .findByReturnRequestIdOrderByCreatedAtAsc(request.getId());
        if (requests == null || requests.isEmpty()) {
            return List.of();
        }
        return requests
                .stream()
                .map(item -> ReturnRequestResponse.AdditionalEvidenceRequest.builder()
                        .id(item.getId())
                        .message(item.getMessage())
                        .requestedBy(item.getRequestedBy())
                        .requestedAt(item.getCreatedAt())
                        .evidence(toAdditionalEvidence(item))
                        .build())
                .toList();
    }

    private List<ReturnRequestResponse.AdditionalEvidence> toAdditionalEvidence(ReturnEvidenceRequest request) {
        if (request == null || request.getEvidence() == null) {
            return List.of();
        }
        return request.getEvidence().stream()
                .filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing(
                        ReturnAdditionalEvidence::getCreatedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(item -> ReturnRequestResponse.AdditionalEvidence.builder()
                        .id(item.getId())
                        .submittedByRole(item.getSubmittedByRole() == null ? null : item.getSubmittedByRole().name())
                        .submittedByUserId(item.getSubmittedByUserId())
                        .submittedByEmail(item.getSubmittedByEmail())
                        .note(item.getNote())
                        .evidenceUrl(item.getEvidenceUrl())
                        .createdAt(item.getCreatedAt())
                        .build())
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReturnRequestResponse> getCustomerReturns(UUID userId) {
        return returnRequestRepository.findByUserId(userId, org.springframework.data.domain.Pageable.unpaged())
                .getContent().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReturnRequestResponse> getCustomerReturnsByOrderId(UUID orderId, UUID userId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        return getCustomerReturnsByOrder(order, userId);
    }

    @Transactional(readOnly = true)
    public List<ReturnRequestResponse> getCustomerReturnsByOrderIdentifier(String orderIdentifier, UUID userId) {
        String normalizedIdentifier = normalizeRequiredText(orderIdentifier, "Order is required");
        Order order = parseUuid(normalizedIdentifier)
                .flatMap(orderRepository::findById)
                .or(() -> orderRepository.findByOrderCode(normalizedIdentifier))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        return getCustomerReturnsByOrder(order, userId);
    }

    @Transactional(readOnly = true)
    public ReturnRequestResponse getCustomerReturnByCode(String code, UUID userId) {
        ReturnRequest request = returnRequestRepository.findByReturnCode(code)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Return request not found"));
        if (request.getUser() == null || !request.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Return request does not belong to this customer");
        }
        return toResponse(request);
    }

    private List<ReturnRequestResponse> getCustomerReturnsByOrder(Order order, UUID userId) {
        if (order.getUser() == null || !order.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Order does not belong to user");
        }
        return returnRequestRepository.findByOrderId(order.getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    private java.util.Optional<UUID> parseUuid(String value) {
        try {
            return java.util.Optional.of(UUID.fromString(value));
        } catch (IllegalArgumentException ex) {
            return java.util.Optional.empty();
        }
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

    private boolean hasCustomerEvidence(ReturnSubmitRequest payload) {
        if (payload == null || payload.getItems() == null) {
            return false;
        }
        for (ReturnSubmitRequest.ReturnItemPayload item : payload.getItems()) {
            if (item == null)
                continue;
            String originalEvidence = normalizeOptionalText(item.getEvidenceUrl());
            String fallbackEvidence = normalizeOptionalText(item.getAdminImageUrl());
            if (!originalEvidence.isEmpty() || !fallbackEvidence.isEmpty()) {
                return true;
            }
        }
        return false;
    }

    private String buildMockTrackingNumber(String returnCode) {
        if (returnCode == null || returnCode.isBlank()) {
            return "RET-MOCK-" + java.util.UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        }
        return "RET-MOCK-" + returnCode.trim().toUpperCase();
    }

    private void assertOpenReturnCanBeCancelled(ReturnRequest request) {
        if (request == null)
            return;
        ReturnRequest.ReturnStatus status = request.getStatus();
        if (status != ReturnRequest.ReturnStatus.REQUESTED && status != ReturnRequest.ReturnStatus.IN_TRANSIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Return request can no longer be cancelled");
        }
    }
}
