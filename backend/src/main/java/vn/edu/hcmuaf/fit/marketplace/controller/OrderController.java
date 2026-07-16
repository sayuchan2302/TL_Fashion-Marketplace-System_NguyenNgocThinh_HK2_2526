package vn.edu.hcmuaf.fit.marketplace.controller;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.dto.request.OrderRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AdminOrderResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.OrderTreeResponseDto;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorAnalyticsResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorOrderDetailResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorOrderPageResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorTopProductResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.security.AuthContext;
import vn.edu.hcmuaf.fit.marketplace.security.AuthContext.UserContext;
import vn.edu.hcmuaf.fit.marketplace.service.OrderService;
import vn.edu.hcmuaf.fit.marketplace.service.AnalyticsRange;
import vn.edu.hcmuaf.fit.marketplace.service.VendorAnalyticsService;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;
    private final AuthContext authContext;
    private final VendorAnalyticsService vendorAnalyticsService;

    public OrderController(OrderService orderService, AuthContext authContext, VendorAnalyticsService vendorAnalyticsService) {
        this.orderService = orderService;
        this.authContext = authContext;
        this.vendorAnalyticsService = vendorAnalyticsService;
    }

    // ─── Customer Endpoints ────────────────────────────────────────────────────

    /**
     * Get current user's orders
     */
    @GetMapping
    public ResponseEntity<List<AdminOrderResponse>> getOrders(@RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(orderService.findByUserId(ctx.getUserId()));
    }

    /**
     * Get order by ID - validates user ownership
     * FIX: Now actually uses userId for ownership validation
     */
    @GetMapping("/{id}")
    public ResponseEntity<AdminOrderResponse> getOrderById(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable UUID id) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        
        // Admin can view any order, customers can only view their own
        if (ctx.isAdmin()) {
            return ResponseEntity.ok(orderService.getAdminOrderById(id));
        }
        return ResponseEntity.ok(orderService.getCustomerOrderById(id, ctx.getUserId()));
    }

    @GetMapping("/{id}/tree")
    public ResponseEntity<OrderTreeResponseDto> getOrderTree(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable UUID id) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(orderService.getCustomerOrderTree(id, ctx.getUserId()));
    }

    @GetMapping("/code/{code}")
    public ResponseEntity<AdminOrderResponse> getOrderByCode(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String code) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        if (ctx.isAdmin()) {
            return ResponseEntity.ok(orderService.getAdminOrderByCode(code));
        }
        return ResponseEntity.ok(orderService.getCustomerOrderByCode(code, ctx.getUserId()));
    }

    @GetMapping("/code/{code}/tree")
    public ResponseEntity<OrderTreeResponseDto> getOrderTreeByCode(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String code) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(orderService.getCustomerOrderTreeByCode(code, ctx.getUserId()));
    }

    /**
     * Create order for current user
     */
    @PostMapping
    public ResponseEntity<AdminOrderResponse> create(
            @RequestHeader("Authorization") String authHeader,
            @RequestBody OrderRequest request) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(orderService.create(ctx.getUserId(), request));
    }

    /**
     * Cancel order - validates user ownership
     */
    @PatchMapping("/{id}/cancel")
    public ResponseEntity<AdminOrderResponse> cancel(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable UUID id,
            @RequestBody CancelRequest request) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(orderService.cancel(id, ctx.getUserId(), request.getReason()));
    }

    /**
     * Track order - validates user ownership
     */
    @GetMapping("/{id}/track")
    public ResponseEntity<AdminOrderResponse> track(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable UUID id) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(orderService.getTrackingInfo(id, ctx.getUserId()));
    }

    // ─── Vendor Endpoints ──────────────────────────────────────────────────────

    /**
     * Get orders for vendor's store
     */
    @GetMapping("/my-store")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorOrderPageResponse> getMyStoreOrders(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false, name = "q") String keyword,
            @RequestParam(required = false, name = "date_from") String dateFrom,
            @RequestParam(required = false, name = "date_to") String dateTo) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        Pageable pageable = PageRequest.of(page, size);

        Order.OrderStatus parsedStatus = parseOrderStatus(status);
        LocalDateTime parsedDateFrom = parseDateStart(dateFrom);
        LocalDateTime parsedDateToExclusive = parseDateExclusiveEnd(dateTo);

        return ResponseEntity.ok(
                orderService.getVendorOrderPage(
                        effectiveStoreId,
                        parsedStatus,
                        keyword,
                        parsedDateFrom,
                        parsedDateToExclusive,
                        pageable
                )
        );
    }

    /**
     * Get specific order for vendor's store
     */
    @GetMapping("/my-store/{id}")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorOrderDetailResponse> getMyStoreOrderById(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @PathVariable UUID id) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        return ResponseEntity.ok(orderService.getVendorOrderDetail(id, effectiveStoreId));
    }

    @GetMapping("/my-store/code/{code}")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorOrderDetailResponse> getMyStoreOrderByCode(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @PathVariable String code) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        return ResponseEntity.ok(orderService.getVendorOrderDetailByCode(code, effectiveStoreId));
    }

    /**
     * Update order status - vendor can only update their own store's orders
     */
    @PatchMapping("/my-store/{id}/status")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorOrderDetailResponse> updateStoreOrderStatus(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @PathVariable UUID id,
            @RequestBody StatusUpdateRequest request) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        Order.OrderStatus status = parseOrderStatus(request.getStatus());
        if (status == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status is required");
        }
        if (status == Order.OrderStatus.CANCELLED
                && (request.getReason() == null || request.getReason().trim().isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancellation reason is required");
        }
        return ResponseEntity.ok(
                orderService.updateVendorOrderStatus(
                        id,
                        effectiveStoreId,
                        status,
                        request.getTrackingNumber(),
                        request.getCarrier(),
                        request.getReason()
                )
        );
    }

    /**
     * Update tracking number for vendor's order
     */
    @PatchMapping("/my-store/{id}/tracking")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorOrderDetailResponse> updateStoreOrderTracking(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @PathVariable UUID id,
            @RequestBody TrackingUpdateRequest request) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        return ResponseEntity.ok(orderService.updateVendorOrderTracking(id, effectiveStoreId, request.getTrackingNumber()));
    }

    /**
     * Get store order statistics (dashboard)
     */
    @GetMapping("/my-store/stats")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> getMyStoreStats(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        
        return ResponseEntity.ok(Map.of(
                "totalOrders", orderService.countByStoreId(effectiveStoreId),
                "pendingOrders", orderService.countByStoreIdAndStatus(effectiveStoreId, Order.OrderStatus.WAITING_FOR_VENDOR),
                "confirmedOrders", orderService.countByStoreIdAndStatus(effectiveStoreId, Order.OrderStatus.CONFIRMED),
                "processingOrders", orderService.countByStoreIdAndStatus(effectiveStoreId, Order.OrderStatus.PROCESSING),
                "shippedOrders", orderService.countByStoreIdAndStatus(effectiveStoreId, Order.OrderStatus.SHIPPED),
                "deliveredOrders", orderService.countByStoreIdAndStatus(effectiveStoreId, Order.OrderStatus.DELIVERED),
                "cancelledOrders", orderService.countByStoreIdAndStatus(effectiveStoreId, Order.OrderStatus.CANCELLED),
                "totalRevenue", orderService.calculateRevenueByStoreId(effectiveStoreId),
                "totalPayout", orderService.calculatePayoutByStoreId(effectiveStoreId)
        ));
    }

    @GetMapping("/my-store/top-products")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<List<VendorTopProductResponse>> getMyStoreTopProducts(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @RequestParam(defaultValue = "30") int days,
            @RequestParam(defaultValue = "5") int limit) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        return ResponseEntity.ok(orderService.getTopProductsByStore(effectiveStoreId, days, limit));
    }

    @GetMapping("/my-store/analytics")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorAnalyticsResponse> getMyStoreAnalytics(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) String bucket) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        if (from == null && to == null && (bucket == null || bucket.isBlank())) {
            return ResponseEntity.ok(vendorAnalyticsService.getAnalytics(effectiveStoreId));
        }
        if (from == null || to == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from and to are required together");
        }
        try {
            return ResponseEntity.ok(vendorAnalyticsService.getAnalytics(
                    effectiveStoreId,
                    AnalyticsRange.resolve(from, to, bucket)));
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage(), exception);
        }
    }

    // ─── Admin Endpoints ───────────────────────────────────────────────────────

    /**
     * Get all orders (admin only)
     */
    @GetMapping("/admin/all")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<List<AdminOrderResponse>> getAllOrders() {
        return ResponseEntity.ok(orderService.findAllAdminOrders());
    }

    /**
     * Update any order status (admin only)
     */
    @PatchMapping("/admin/{id}/status")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<AdminOrderResponse> updateOrderStatus(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String id,
            @RequestBody StatusUpdateRequest request) {
        UserContext admin = authContext.requireAdmin(authHeader);
        UUID resolvedId = orderService.resolveOrderId(id);
        Order.OrderStatus status = parseOrderStatus(request.getStatus());
        if (status == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status is required");
        }
        orderService.updateStatus(resolvedId, status, admin.getUserId(), admin.getEmail());
        return ResponseEntity.ok(orderService.getAdminOrderById(resolvedId));
    }

    /**
     * Update tracking number for any order (admin only)
     */
    @PatchMapping("/admin/{id}/tracking")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<AdminOrderResponse> updateOrderTracking(
            @PathVariable String id,
            @RequestBody TrackingUpdateRequest request) {
        UUID resolvedId = orderService.resolveOrderId(id);
        return ResponseEntity.ok(orderService.updateAdminOrderTracking(resolvedId, request.getTrackingNumber()));
    }

    private Order.OrderStatus parseOrderStatus(String rawStatus) {
        if (rawStatus == null || rawStatus.isBlank()) {
            return null;
        }

        String normalized = rawStatus.trim().toUpperCase(Locale.ROOT);
        String resolved = switch (normalized) {
            case "PENDING" -> "WAITING_FOR_VENDOR";
            case "SHIPPING" -> "SHIPPED";
            case "COMPLETED", "DONE" -> "DELIVERED";
            case "CANCELED" -> "CANCELLED";
            default -> normalized;
        };

        try {
            return Order.OrderStatus.valueOf(resolved);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported status: " + rawStatus);
        }
    }

    private LocalDateTime parseDateStart(String rawDate) {
        if (rawDate == null || rawDate.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(rawDate).atStartOfDay();
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date_from format. Use YYYY-MM-DD");
        }
    }

    private LocalDateTime parseDateExclusiveEnd(String rawDate) {
        if (rawDate == null || rawDate.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(rawDate).plusDays(1).atStartOfDay();
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date_to format. Use YYYY-MM-DD");
        }
    }

    // ─── Request DTOs ──────────────────────────────────────────────────────────

    public static class CancelRequest {
        private String reason;

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }

    public static class StatusUpdateRequest {
        private String status;
        private String trackingNumber;
        private String carrier;
        private String reason;

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public String getTrackingNumber() {
            return trackingNumber;
        }

        public void setTrackingNumber(String trackingNumber) {
            this.trackingNumber = trackingNumber;
        }

        public String getCarrier() {
            return carrier;
        }

        public void setCarrier(String carrier) {
            this.carrier = carrier;
        }

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }

    public static class TrackingUpdateRequest {
        private String trackingNumber;

        public String getTrackingNumber() {
            return trackingNumber;
        }

        public void setTrackingNumber(String trackingNumber) {
            this.trackingNumber = trackingNumber;
        }
    }
}
