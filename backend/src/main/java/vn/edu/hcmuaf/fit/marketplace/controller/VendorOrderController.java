package vn.edu.hcmuaf.fit.marketplace.controller;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorOrderDetailResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorSubOrderPageResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.security.AuthContext;
import vn.edu.hcmuaf.fit.marketplace.security.AuthContext.UserContext;
import vn.edu.hcmuaf.fit.marketplace.service.OrderService;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.UUID;

@RestController
@RequestMapping("/api/vendor/orders")
public class VendorOrderController {

    private final OrderService orderService;
    private final AuthContext authContext;

    public VendorOrderController(OrderService orderService, AuthContext authContext) {
        this.orderService = orderService;
        this.authContext = authContext;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorSubOrderPageResponse> getVendorSubOrders(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false, name = "q") String keyword,
            @RequestParam(required = false, name = "date_from") String dateFrom,
            @RequestParam(required = false, name = "date_to") String dateTo
    ) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        Pageable pageable = PageRequest.of(page, size);

        Order.OrderStatus parsedStatus = parseOrderStatus(status);
        LocalDateTime parsedDateFrom = parseDateStart(dateFrom);
        LocalDateTime parsedDateToExclusive = parseDateExclusiveEnd(dateTo);

        return ResponseEntity.ok(
                orderService.getVendorSubOrderPage(
                        effectiveStoreId,
                        parsedStatus,
                        keyword,
                        parsedDateFrom,
                        parsedDateToExclusive,
                        pageable
                )
        );
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorOrderDetailResponse> getVendorOrderDetail(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @PathVariable UUID id
    ) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        return ResponseEntity.ok(orderService.getVendorOrderDetail(id, effectiveStoreId));
    }

    @GetMapping("/code/{code}")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorOrderDetailResponse> getVendorOrderDetailByCode(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @PathVariable String code
    ) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        return ResponseEntity.ok(orderService.getVendorOrderDetailByCode(code, effectiveStoreId));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorOrderDetailResponse> updateStatus(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @PathVariable UUID id,
            @RequestBody OrderController.StatusUpdateRequest request
    ) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        Order.OrderStatus status = parseOrderStatus(request.getStatus());
        if (status == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status is required");
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

    @PatchMapping("/{id}/tracking")
    @PreAuthorize("hasAnyRole('VENDOR', 'SUPER_ADMIN')")
    public ResponseEntity<VendorOrderDetailResponse> updateTracking(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID storeId,
            @PathVariable UUID id,
            @RequestBody OrderController.TrackingUpdateRequest request
    ) {
        UserContext ctx = authContext.requireVendor(authHeader);
        UUID effectiveStoreId = authContext.resolveRequiredStoreId(ctx, storeId);
        return ResponseEntity.ok(orderService.updateVendorOrderTracking(id, effectiveStoreId, request.getTrackingNumber()));
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
}
