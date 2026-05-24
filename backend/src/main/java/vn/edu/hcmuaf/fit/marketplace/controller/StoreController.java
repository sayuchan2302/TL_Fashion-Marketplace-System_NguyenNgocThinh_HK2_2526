package vn.edu.hcmuaf.fit.marketplace.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import vn.edu.hcmuaf.fit.marketplace.dto.request.StoreRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.PublicStoreResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.StoreFollowResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.StoreResponse;
import vn.edu.hcmuaf.fit.marketplace.security.AuthContext;
import vn.edu.hcmuaf.fit.marketplace.security.JwtService;
import vn.edu.hcmuaf.fit.marketplace.service.StoreFollowService;
import vn.edu.hcmuaf.fit.marketplace.service.StoreImageStorageService;
import vn.edu.hcmuaf.fit.marketplace.service.StoreService;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.math.BigDecimal;

@RestController
@RequestMapping("/api/stores")
public class StoreController {

    private final StoreService storeService;
    private final StoreFollowService storeFollowService;
    private final JwtService jwtService;
    private final AuthContext authContext;
    private final StoreImageStorageService storeImageStorageService;

    public StoreController(
            StoreService storeService,
            StoreFollowService storeFollowService,
            JwtService jwtService,
            AuthContext authContext,
            StoreImageStorageService storeImageStorageService
    ) {
        this.storeService = storeService;
        this.storeFollowService = storeFollowService;
        this.jwtService = jwtService;
        this.authContext = authContext;
        this.storeImageStorageService = storeImageStorageService;
    }

    @PostMapping("/register")
    public ResponseEntity<StoreResponse> registerStore(
            @RequestHeader("Authorization") String authHeader,
            @RequestBody StoreRequest request) {
        UUID userId = UUID.fromString(jwtService.extractUserId(authHeader.replace("Bearer ", "")));
        return ResponseEntity.ok(storeService.registerStore(userId, request));
    }

    @GetMapping("/my-store")
    public ResponseEntity<StoreResponse> getMyStore(@RequestHeader("Authorization") String authHeader) {
        UUID userId = UUID.fromString(jwtService.extractUserId(authHeader.replace("Bearer ", "")));
        return storeService.findStoreByOwner(userId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}")
    public ResponseEntity<PublicStoreResponse> getStoreById(@PathVariable UUID id) {
        return ResponseEntity.ok(storeService.getStoreById(id));
    }

    @GetMapping("/slug/{slug}")
    public ResponseEntity<PublicStoreResponse> getStoreBySlug(@PathVariable String slug) {
        return ResponseEntity.ok(storeService.getStoreBySlug(slug));
    }

    @GetMapping("/{id}/followers/count")
    public ResponseEntity<StoreFollowResponse> getFollowerCount(@PathVariable UUID id) {
        return ResponseEntity.ok(storeFollowService.getFollowState(id, null));
    }

    @GetMapping("/{id}/follow-status")
    public ResponseEntity<StoreFollowResponse> getFollowStatus(
            @PathVariable UUID id,
            @RequestHeader(value = "Authorization", required = false) String authHeader
    ) {
        UUID userId = null;
        if (authHeader != null && !authHeader.isBlank()) {
            userId = authContext.fromAuthHeader(authHeader).getUserId();
        }
        return ResponseEntity.ok(storeFollowService.getFollowState(id, userId));
    }

    @PostMapping("/{id}/follow")
    public ResponseEntity<StoreFollowResponse> followStore(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader
    ) {
        UUID userId = authContext.fromAuthHeader(authHeader).getUserId();
        return ResponseEntity.ok(storeFollowService.follow(id, userId));
    }

    @DeleteMapping("/{id}/follow")
    public ResponseEntity<StoreFollowResponse> unfollowStore(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader
    ) {
        UUID userId = authContext.fromAuthHeader(authHeader).getUserId();
        return ResponseEntity.ok(storeFollowService.unfollow(id, userId));
    }

    @GetMapping
    public ResponseEntity<List<PublicStoreResponse>> getActiveStores() {
        return ResponseEntity.ok(storeService.getAllActiveStores());
    }

    @GetMapping("/admin")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<List<StoreResponse>> getAllStoresForAdmin() {
        return ResponseEntity.ok(storeService.getAllStoresForAdmin());
    }

    @GetMapping("/pending")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<List<StoreResponse>> getPendingStores() {
        return ResponseEntity.ok(storeService.getPendingStores());
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<StoreResponse> approveStore(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {
        AuthContext.UserContext admin = authContext.requireAdmin(authHeader);
        return ResponseEntity.ok(storeService.approveStore(id, admin.getUserId(), admin.getEmail()));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<StoreResponse> rejectStore(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader,
            @RequestBody RejectRequest request) {
        AuthContext.UserContext admin = authContext.requireAdmin(authHeader);
        return ResponseEntity.ok(storeService.rejectStore(id, admin.getUserId(), admin.getEmail(), request.getReason()));
    }


    @PostMapping("/{id}/suspend")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<StoreResponse> suspendStore(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {
        AuthContext.UserContext admin = authContext.requireAdmin(authHeader);
        return ResponseEntity.ok(storeService.suspendStore(id, admin.getUserId(), admin.getEmail()));
    }

    @PostMapping("/{id}/reactivate")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<StoreResponse> reactivateStore(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {
        AuthContext.UserContext admin = authContext.requireAdmin(authHeader);
        return ResponseEntity.ok(storeService.reactivateStore(id, admin.getUserId(), admin.getEmail()));
    }

    @PatchMapping("/{id}/bank-verification")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<StoreResponse> updateBankVerification(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader,
            @RequestBody BankVerificationRequest request
    ) {
        AuthContext.UserContext admin = authContext.requireAdmin(authHeader);
        return ResponseEntity.ok(storeService.updateBankVerification(
                id,
                request.getBankVerified(),
                admin.getUserId(),
                admin.getEmail(),
                request.getNote()
        ));
    }

    @PatchMapping("/{id}/commission-rate")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<StoreResponse> updateCommissionRate(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader,
            @RequestBody CommissionRateRequest request
    ) {
        AuthContext.UserContext admin = authContext.requireAdmin(authHeader);
        return ResponseEntity.ok(storeService.updateCommissionRateAsAdmin(
                id,
                request.getCommissionRate(),
                admin.getUserId(),
                admin.getEmail(),
                request.getNote()
        ));
    }

    @PatchMapping("/{id}/commission-rate/default")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<StoreResponse> resetCommissionRateToDefault(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader,
            @RequestBody(required = false) CommissionRateRequest request
    ) {
        AuthContext.UserContext admin = authContext.requireAdmin(authHeader);
        return ResponseEntity.ok(storeService.resetCommissionRateToDefaultAsAdmin(
                id,
                admin.getUserId(),
                admin.getEmail(),
                request != null ? request.getNote() : null
        ));
    }

    @PutMapping("/my-store")
    public ResponseEntity<StoreResponse> updateStore(
            @RequestHeader("Authorization") String authHeader,
            @RequestBody StoreRequest request) {
        UUID userId = UUID.fromString(jwtService.extractUserId(authHeader.replace("Bearer ", "")));
        return ResponseEntity.ok(storeService.updateStore(userId, request));
    }

    @PostMapping("/upload-image")
    public ResponseEntity<Map<String, String>> uploadStoreImage(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam("file") MultipartFile file
    ) {
        authContext.requireVendor(authHeader);
        String imageUrl = storeImageStorageService.storeStoreImage(file);
        return ResponseEntity.ok(Map.of("url", imageUrl));
    }

    public static class RejectRequest {
        private String reason;

        public RejectRequest() {}

        public RejectRequest(String reason) {
            this.reason = reason;
        }

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }


    public static class BankVerificationRequest {
        private Boolean bankVerified;
        private String note;

        public Boolean getBankVerified() {
            return bankVerified;
        }

        public void setBankVerified(Boolean bankVerified) {
            this.bankVerified = bankVerified;
        }

        public String getNote() {
            return note;
        }

        public void setNote(String note) {
            this.note = note;
        }
    }

    public static class CommissionRateRequest {
        private BigDecimal commissionRate;
        private String note;

        public BigDecimal getCommissionRate() {
            return commissionRate;
        }

        public void setCommissionRate(BigDecimal commissionRate) {
            this.commissionRate = commissionRate;
        }

        public String getNote() {
            return note;
        }

        public void setNote(String note) {
            this.note = note;
        }
    }
}
