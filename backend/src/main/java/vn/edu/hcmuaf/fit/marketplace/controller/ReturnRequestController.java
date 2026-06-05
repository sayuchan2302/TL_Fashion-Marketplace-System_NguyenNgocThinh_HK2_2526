package vn.edu.hcmuaf.fit.marketplace.controller;

import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import vn.edu.hcmuaf.fit.marketplace.dto.request.ReturnAdminVerdictRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.request.ReturnCancelRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.request.ReturnDisputeRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.request.ReturnSubmitRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.ReturnRequestResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorReturnSummaryResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;
import vn.edu.hcmuaf.fit.marketplace.exception.ForbiddenException;
import vn.edu.hcmuaf.fit.marketplace.security.AuthContext;
import vn.edu.hcmuaf.fit.marketplace.security.AuthContext.UserContext;
import vn.edu.hcmuaf.fit.marketplace.service.ReturnEvidenceStorageService;
import vn.edu.hcmuaf.fit.marketplace.service.ReturnRequestService;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/returns")
public class ReturnRequestController {

    private final ReturnRequestService returnRequestService;
    private final AuthContext authContext;
    private final ReturnEvidenceStorageService returnEvidenceStorageService;

    public ReturnRequestController(
            ReturnRequestService returnRequestService,
            AuthContext authContext,
            ReturnEvidenceStorageService returnEvidenceStorageService) {
        this.returnRequestService = returnRequestService;
        this.authContext = authContext;
        this.returnEvidenceStorageService = returnEvidenceStorageService;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ReturnRequestResponse> submit(
            @Valid @RequestBody ReturnSubmitRequest request,
            @RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(returnRequestService.submit(ctx.getUserId(), request));
    }

    @PostMapping(value = "/upload-evidence", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, String>> uploadEvidence(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam("file") MultipartFile file) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        if (!ctx.isCustomer() && !ctx.isVendor()) {
            throw new ForbiddenException("Only customer or vendor accounts can upload return evidence");
        }
        String evidenceUrl = returnEvidenceStorageService.storeEvidence(file);
        return ResponseEntity.ok(Map.of("url", evidenceUrl));
    }

    @PatchMapping("/{id}/cancel")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ReturnRequestResponse> cancelReturn(
            @PathVariable UUID id,
            @RequestBody(required = false) ReturnCancelRequest request,
            @RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(returnRequestService.cancelReturnByCustomer(id, ctx.getUserId(), ctx.getEmail()));
    }

    @PatchMapping("/{id}/dispute")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ReturnRequestResponse> openDispute(
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, String> request,
            @RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        String reason = request != null ? request.get("reason") : null;
        return ResponseEntity.ok(returnRequestService.openDispute(id, ctx.getUserId(), reason, ctx.getEmail()));
    }

    @GetMapping("/my-store")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Page<ReturnRequestResponse>> listMyStoreReturns(
            @RequestParam(value = "status", required = false) ReturnRequest.ReturnStatus status,
            @RequestParam(value = "statuses", required = false) List<ReturnRequest.ReturnStatus> statuses,
            @RequestParam(value = "q", required = false) String keyword,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "20") int size,
            @RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.requireVendor(authHeader);
        PageRequest pageable = PageRequest.of(
                Math.max(page, 0),
                Math.min(size, 100),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        List<ReturnRequest.ReturnStatus> effectiveStatuses = mergeStatuses(status, statuses);
        return ResponseEntity
                .ok(returnRequestService.listForVendor(ctx.getStoreId(), effectiveStatuses, keyword, pageable));
    }

    @GetMapping("/my-store/summary")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<VendorReturnSummaryResponse> getMyStoreSummary(
            @RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.requireVendor(authHeader);
        return ResponseEntity.ok(returnRequestService.getVendorSummary(ctx.getStoreId()));
    }

    @PatchMapping("/my-store/{id}/approve")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<ReturnRequestResponse> approveReturn(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.requireVendor(authHeader);
        return ResponseEntity.ok(returnRequestService.sellerApproveReturn(id, ctx.getStoreId(), ctx.getEmail()));
    }

    @PatchMapping("/my-store/{id}/dispute")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<ReturnRequestResponse> disputeReturn(
            @PathVariable UUID id,
            @Valid @RequestBody ReturnDisputeRequest request,
            @RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.requireVendor(authHeader);
        return ResponseEntity
                .ok(returnRequestService.sellerDisputeReturn(id, ctx.getStoreId(), request.getReason(),
                        request.getEvidenceUrl(), ctx.getEmail()));
    }

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Page<ReturnRequestResponse>> list(
            @RequestParam(value = "status", required = false) ReturnRequest.ReturnStatus status,
            @RequestParam(value = "statuses", required = false) List<ReturnRequest.ReturnStatus> statuses,
            @RequestParam(value = "q", required = false) String keyword,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "20") int size) {
        PageRequest pageable = PageRequest.of(
                Math.max(page, 0),
                Math.min(size, 100),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        List<ReturnRequest.ReturnStatus> effectiveStatuses = mergeStatuses(status, statuses);
        return ResponseEntity.ok(returnRequestService.list(effectiveStatuses, keyword, pageable));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<ReturnRequestResponse> get(@PathVariable UUID id) {
        return ResponseEntity.ok(returnRequestService.get(id));
    }

    @GetMapping("/code/{code}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<ReturnRequestResponse> getByCode(@PathVariable String code) {
        return ResponseEntity.ok(returnRequestService.getByCode(code));
    }

    @PatchMapping("/admin/{id}/verdict")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<ReturnRequestResponse> finalVerdict(
            @PathVariable UUID id,
            @Valid @RequestBody ReturnAdminVerdictRequest request,
            @RequestHeader("Authorization") String authHeader) {
        UserContext admin = authContext.requireAdmin(authHeader);
        String winner = request.getAction() == ReturnAdminVerdictRequest.VerdictAction.REFUND_TO_CUSTOMER ? "customer"
                : "seller";
        return ResponseEntity.ok(returnRequestService.adminResolveDispute(
                id,
                winner,
                request.getAdminNote(),
                admin.getUserId(),
                admin.getEmail()));
    }

    @GetMapping("/customer")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ReturnRequestResponse>> listMyReturns(
            @RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(returnRequestService.getCustomerReturns(ctx.getUserId()));
    }

    @GetMapping("/customer/code/{code}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ReturnRequestResponse> getMyReturnByCode(
            @PathVariable String code,
            @RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(returnRequestService.getCustomerReturnByCode(code, ctx.getUserId()));
    }

    @GetMapping("/order/{orderId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ReturnRequestResponse>> getByOrderId(
            @PathVariable String orderId,
            @RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.fromAuthHeader(authHeader);
        return ResponseEntity.ok(returnRequestService.getCustomerReturnsByOrderIdentifier(orderId, ctx.getUserId()));
    }

    private List<ReturnRequest.ReturnStatus> mergeStatuses(
            ReturnRequest.ReturnStatus status,
            List<ReturnRequest.ReturnStatus> statuses) {
        List<ReturnRequest.ReturnStatus> merged = new ArrayList<>();
        if (statuses != null) {
            for (ReturnRequest.ReturnStatus item : statuses) {
                if (item != null && !merged.contains(item)) {
                    merged.add(item);
                }
            }
        }
        if (status != null && !merged.contains(status)) {
            merged.add(status);
        }
        return merged;
    }
}
