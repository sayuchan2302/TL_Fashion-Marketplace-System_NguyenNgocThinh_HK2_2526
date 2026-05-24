package vn.edu.hcmuaf.fit.marketplace.service;

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
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
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

    private final ReturnRequestRepository returnRequestRepository;
    private final OrderRepository orderRepository;
    private final StoreRepository storeRepository;
    private final PublicCodeService publicCodeService;
    private final WalletService walletService;
    private final AdminAuditLogService adminAuditLogService;
    private final NotificationDomainService notificationDomainService;

    @Autowired
    public ReturnRequestService(
            ReturnRequestRepository returnRequestRepository,
            OrderRepository orderRepository,
            StoreRepository storeRepository,
            PublicCodeService publicCodeService,
            WalletService walletService,
            AdminAuditLogService adminAuditLogService,
            NotificationDomainService notificationDomainService) {
        this.returnRequestRepository = returnRequestRepository;
        this.orderRepository = orderRepository;
        this.storeRepository = storeRepository;
        this.publicCodeService = publicCodeService;
        this.walletService = walletService;
        this.adminAuditLogService = adminAuditLogService;
        this.notificationDomainService = notificationDomainService;
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
        if (payload.getItems() == null || payload.getItems().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Return request must include at least one item");
        }

        Map<UUID, OrderItem> orderItemMap = order.getItems().stream()
                .collect(Collectors.toMap(OrderItem::getId, oi -> oi));
        Set<UUID> requestedOrderItemIds = new HashSet<>();

        List<ReturnRequest.ReturnItemSnapshot> snapshots = payload.getItems().stream().map(itemPayload -> {
            if (itemPayload == null || itemPayload.getOrderItemId() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order item is required");
            }
            if (!requestedOrderItemIds.add(itemPayload.getOrderItemId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate order item in return request");
            }
            OrderItem matched = orderItemMap.get(itemPayload.getOrderItemId());
            if (matched == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid order item");
            }
            if (matched.getStoreId() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Return item does not belong to a vendor store");
            }

            int requestedQty = itemPayload.getQuantity() == null ? matched.getQuantity() : itemPayload.getQuantity();
            if (requestedQty <= 0 || requestedQty > matched.getQuantity()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid return quantity");
            }

            String evidenceUrl = normalizeOptionalText(itemPayload.getEvidenceUrl());
            if (evidenceUrl.isEmpty()) {
                evidenceUrl = normalizeOptionalText(itemPayload.getAdminImageUrl());
            }

            return new ReturnRequest.ReturnItemSnapshot(
                    matched.getId(),
                    matched.getProductName(),
                    matched.getVariantName(),
                    matched.getProductImage(),
                    evidenceUrl.isEmpty() ? null : evidenceUrl,
                    requestedQty,
                    safeAmount(matched.getUnitPrice()));
        }).toList();

        assertNoOpenReturnConflict(order.getId(), requestedOrderItemIds);
        UUID storeId = resolveSingleStoreId(snapshots, orderItemMap);

        ReturnRequest request = ReturnRequest.builder()
                .returnCode(publicCodeService.nextReturnCode())
                .order(order)
                .user(order.getUser())
                .storeId(storeId)
                .reason(payload.getReason())
                .note(payload.getNote())
                .resolution(payload.getResolution())
                .status(ReturnRequest.ReturnStatus.PENDING_VENDOR)
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
        long pendingVendor = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.PENDING_VENDOR, 0L);
        long received = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.RECEIVED, 0L);
        long shipping = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.SHIPPING, 0L);
        long disputed = countsByStatus.getOrDefault(ReturnRequest.ReturnStatus.DISPUTED, 0L);

        return VendorReturnSummaryResponse.builder()
                .all(total)
                .needsAction(pendingVendor + received)
                .inTransit(shipping)
                .toInspect(received)
                .disputed(disputed)
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
    public ReturnRequestResponse acceptReturn(UUID returnId, UUID storeId, String actor) {
        ReturnRequest request = findById(returnId);
        assertStoreOwnership(request, storeId);
        assertStatus(request, ReturnRequest.ReturnStatus.PENDING_VENDOR);

        request.setStatus(ReturnRequest.ReturnStatus.ACCEPTED);
        request.setVendorReason(null);
        request.setUpdatedBy(actor);
        ReturnRequest saved = returnRequestRepository.save(request);
        notifyCustomerReturnStatusChanged(saved);
        return toResponse(saved);
    }

    @Transactional
    public ReturnRequestResponse rejectReturn(UUID returnId, UUID storeId, String reason, String actor) {
        String normalizedReason = normalizeRequiredText(reason, "Reject reason is required");
        ReturnRequest request = findById(returnId);
        assertStoreOwnership(request, storeId);
        if (request.getStatus() != ReturnRequest.ReturnStatus.PENDING_VENDOR
                && request.getStatus() != ReturnRequest.ReturnStatus.RECEIVED) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Reject action only allowed for pending or received requests");
        }

        request.setStatus(ReturnRequest.ReturnStatus.REJECTED);
        request.setVendorReason(normalizedReason);
        request.setAdminFinalized(false);
        request.setUpdatedBy(actor);
        ReturnRequest saved = returnRequestRepository.save(request);
        notifyCustomerReturnStatusChanged(saved);
        return toResponse(saved);
    }

    @Transactional
    public ReturnRequestResponse markShipping(UUID returnId, UUID userId, String trackingNumber, String carrier,
            String actor) {
        ReturnRequest request = findById(returnId);
        assertCustomerOwnership(request, userId);
        assertStatus(request, ReturnRequest.ReturnStatus.ACCEPTED);

        request.setStatus(ReturnRequest.ReturnStatus.SHIPPING);
        request.setShippingTrackingNumber(normalizeRequiredText(trackingNumber, "Tracking number is required"));
        request.setShippingCarrier(normalizeRequiredText(carrier, "Carrier is required"));
        request.setShippedAt(LocalDateTime.now());
        request.setUpdatedBy(actor);
        return toResponse(returnRequestRepository.save(request));
    }

    @Transactional
    public ReturnRequestResponse markReceived(UUID returnId, UUID storeId, String actor) {
        ReturnRequest request = findById(returnId);
        assertStoreOwnership(request, storeId);
        assertStatus(request, ReturnRequest.ReturnStatus.SHIPPING);

        request.setStatus(ReturnRequest.ReturnStatus.RECEIVED);
        request.setReceivedAt(LocalDateTime.now());
        request.setUpdatedBy(actor);
        ReturnRequest saved = returnRequestRepository.save(request);
        notifyCustomerReturnStatusChanged(saved);
        return toResponse(saved);
    }

    @Transactional
    public ReturnRequestResponse confirmReceipt(UUID returnId, UUID storeId, String actor) {
        ReturnRequest request = findById(returnId);
        assertStoreOwnership(request, storeId);
        assertStatus(request, ReturnRequest.ReturnStatus.RECEIVED);

        BigDecimal refundAmount = calculateRefundAmount(request);
        if (refundAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Refund amount must be greater than zero");
        }

        request.setStatus(ReturnRequest.ReturnStatus.COMPLETED);
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
        notifyCustomerReturnStatusChanged(saved);
        return toResponse(saved);
    }

    @Transactional
    public ReturnRequestResponse openDispute(UUID returnId, UUID userId, String reason, String actor) {
        ReturnRequest request = findById(returnId);
        assertCustomerOwnership(request, userId);
        assertStatus(request, ReturnRequest.ReturnStatus.REJECTED);
        if (Boolean.TRUE.equals(request.getAdminFinalized())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Return request has been finalized by admin");
        }

        request.setStatus(ReturnRequest.ReturnStatus.DISPUTED);
        request.setDisputeReason(normalizeRequiredText(reason, "Dispute reason is required"));
        request.setUpdatedBy(actor);
        return toResponse(returnRequestRepository.save(request));
    }

    @Transactional
    public ReturnRequestResponse cancelByCustomer(UUID returnId, UUID userId, String reason, String actor) {
        ReturnRequest request = findById(returnId);
        assertCustomerOwnership(request, userId);
        if (request.getStatus() != ReturnRequest.ReturnStatus.PENDING_VENDOR
                && request.getStatus() != ReturnRequest.ReturnStatus.ACCEPTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Return request can no longer be cancelled");
        }

        request.setStatus(ReturnRequest.ReturnStatus.CANCELLED);
        String normalizedReason = normalizeOptionalText(reason);
        if (!normalizedReason.isEmpty()) {
            String baseNote = normalizeOptionalText(request.getNote());
            String cancelNote = "Customer cancelled request: " + normalizedReason;
            request.setNote(baseNote.isEmpty() ? cancelNote : baseNote + "\n" + cancelNote);
        }
        request.setUpdatedBy(actor);
        return toResponse(returnRequestRepository.save(request));
    }

    @Transactional
    public ReturnRequestResponse finalVerdict(
            UUID returnId,
            ReturnAdminVerdictRequest.VerdictAction action,
            String adminNote,
            UUID adminId,
            String adminEmail) {
        if (action == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Verdict action is required");
        }

        ReturnAdminVerdictRequest.VerdictAction safeAction = action;
        try {
            ReturnRequest request = findById(returnId);
            assertStatus(request, ReturnRequest.ReturnStatus.DISPUTED);

            if (safeAction == ReturnAdminVerdictRequest.VerdictAction.REFUND_TO_CUSTOMER) {
                BigDecimal refundAmount = calculateRefundAmount(request);
                if (refundAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Refund amount must be greater than zero");
                }
                request.setStatus(ReturnRequest.ReturnStatus.COMPLETED);
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

                writeAdminAuditLog(
                        adminId,
                        adminEmail,
                        "RETURN",
                        "FINAL_VERDICT_REFUND_TO_CUSTOMER",
                        saved.getId(),
                        true,
                        normalizeOptionalText(adminNote));
                notifyCustomerReturnStatusChanged(saved);
                return toResponse(saved);
            }

            request.setStatus(ReturnRequest.ReturnStatus.REJECTED);
            String normalizedAdminNote = normalizeOptionalText(adminNote);
            if (normalizedAdminNote.isEmpty()) {
                normalizedAdminNote = "Final verdict: release to vendor";
            }
            request.setAdminNote(normalizedAdminNote);
            request.setAdminFinalized(true);
            request.setUpdatedBy(adminEmail);
            ReturnRequest saved = returnRequestRepository.save(request);
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "RETURN",
                    "FINAL_VERDICT_RELEASE_TO_VENDOR",
                    saved.getId(),
                    true,
                    normalizedAdminNote);
            notifyCustomerReturnStatusChanged(saved);
            return toResponse(saved);
        } catch (RuntimeException ex) {
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "RETURN",
                    safeAction == ReturnAdminVerdictRequest.VerdictAction.REFUND_TO_CUSTOMER
                            ? "FINAL_VERDICT_REFUND_TO_CUSTOMER"
                            : "FINAL_VERDICT_RELEASE_TO_VENDOR",
                    returnId,
                    false,
                    ex.getMessage());
            throw ex;
        }
    }

    private void notifyCustomerReturnCreated(ReturnRequest request) {
        if (notificationDomainService == null || request == null || request.getUser() == null
                || request.getUser().getId() == null) {
            return;
        }
        String code = resolveReturnCode(request);
        String title = "Yêu cầu #" + code + " đã được tạo";
        String message = "Yêu cầu đổi/trả của bạn đã được gửi tới người bán.";
        notificationDomainService.createAndPush(
                request.getUser().getId(),
                Notification.NotificationType.SYSTEM,
                title,
                message,
                buildReturnDetailLink(request));
    }

    private void notifyCustomerReturnStatusChanged(ReturnRequest request) {
        if (notificationDomainService == null || request == null || request.getUser() == null
                || request.getUser().getId() == null) {
            return;
        }
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
    }

    private String returnStatusTitle(ReturnRequest.ReturnStatus status) {
        return switch (status) {
            case PENDING_VENDOR -> "đã gửi tới người bán";
            case ACCEPTED -> "được chấp nhận";
            case SHIPPING -> "đang vận chuyển";
            case RECEIVED -> "đã được người bán nhận";
            case COMPLETED -> "đã hoàn tất";
            case REJECTED -> "bị từ chối";
            case DISPUTED -> "đang được xử lý tranh chấp";
            case CANCELLED -> "đã bị hủy";
        };
    }

    private String returnStatusMessage(ReturnRequest.ReturnStatus status) {
        return switch (status) {
            case PENDING_VENDOR -> "Người bán sẽ phản hồi yêu cầu đổi/trả của bạn sớm.";
            case ACCEPTED -> "Người bán đã chấp nhận yêu cầu đổi/trả của bạn.";
            case SHIPPING -> "Bạn đã cập nhật vận chuyển cho yêu cầu đổi/trả.";
            case RECEIVED -> "Người bán đã nhận được kiện hàng hoàn trả.";
            case COMPLETED -> "Yêu cầu đổi/trả đã hoàn tất.";
            case REJECTED -> "Yêu cầu đổi/trả đã bị từ chối.";
            case DISPUTED -> "Yêu cầu đổi/trả đang trong quá trình xử lý tranh chấp.";
            case CANCELLED -> "Yêu cầu đổi/trả đã được hủy.";
        };
    }

    private String buildReturnDetailLink(ReturnRequest request) {
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
        return status == ReturnRequest.ReturnStatus.PENDING_VENDOR
                || status == ReturnRequest.ReturnStatus.ACCEPTED
                || status == ReturnRequest.ReturnStatus.SHIPPING
                || status == ReturnRequest.ReturnStatus.RECEIVED
                || status == ReturnRequest.ReturnStatus.DISPUTED;
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
        String storeName = effectiveStoreId == null
                ? null
                : storeRepository.findById(effectiveStoreId).map(Store::getName).orElse(null);

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
                .shippingTrackingNumber(request.getShippingTrackingNumber())
                .shippingCarrier(request.getShippingCarrier())
                .adminNote(request.getAdminNote())
                .updatedBy(request.getUpdatedBy())
                .shippedAt(request.getShippedAt())
                .receivedAt(request.getReceivedAt())
                .completedAt(request.getCompletedAt())
                .createdAt(request.getCreatedAt())
                .updatedAt(request.getUpdatedAt())
                .build();
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
}
