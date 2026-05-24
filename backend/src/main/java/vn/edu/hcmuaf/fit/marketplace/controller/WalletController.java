package vn.edu.hcmuaf.fit.marketplace.controller;

import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import vn.edu.hcmuaf.fit.marketplace.dto.request.PayoutRequestCreateRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.PayoutRequestResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.WalletResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.WalletTransactionResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.PayoutRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.VendorWallet;
import vn.edu.hcmuaf.fit.marketplace.entity.WalletTransaction;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.security.AuthContext;
import vn.edu.hcmuaf.fit.marketplace.security.AuthContext.UserContext;
import vn.edu.hcmuaf.fit.marketplace.service.WalletService;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/wallets")
public class WalletController {

    private final WalletService walletService;
    private final StoreRepository storeRepository;
    private final AuthContext authContext;

    public WalletController(WalletService walletService, StoreRepository storeRepository, AuthContext authContext) {
        this.walletService = walletService;
        this.storeRepository = storeRepository;
        this.authContext = authContext;
    }

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Page<WalletResponse>> getAllWallets(
            @RequestParam(required = false, defaultValue = "") String keyword,
            Pageable pageable) {
        Page<VendorWallet> wallets = walletService.getAllWalletsPageable(keyword, pageable);
        return ResponseEntity.ok(wallets.map(this::toResponse));
    }

    @GetMapping("/my-wallet")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<WalletResponse> getMyWallet(@RequestHeader("Authorization") String authHeader) {
        UserContext ctx = authContext.requireVendor(authHeader);
        VendorWallet wallet = walletService.getOrCreateWallet(ctx.getStoreId());
        return ResponseEntity.ok(toResponse(wallet));
    }

    @GetMapping("/my-wallet/transactions")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Page<WalletTransactionResponse>> getMyTransactions(
            @RequestHeader("Authorization") String authHeader,
            Pageable pageable) {
        UserContext ctx = authContext.requireVendor(authHeader);
        Page<WalletTransaction> transactions = walletService.getTransactions(ctx.getStoreId(), pageable);
        return ResponseEntity.ok(transactions.map(this::toResponse));
    }

    @GetMapping("/{storeId}/transactions")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Page<WalletTransactionResponse>> getStoreTransactions(
            @PathVariable UUID storeId,
            Pageable pageable) {
        Page<WalletTransaction> transactions = walletService.getTransactions(storeId, pageable);
        return ResponseEntity.ok(transactions.map(this::toResponse));
    }

    @PostMapping("/{storeId}/withdraw")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<WalletTransactionResponse> withdraw(
            @PathVariable UUID storeId,
            @RequestBody(required = false) Map<String, Object> payload) {
        BigDecimal amount = (payload != null && payload.get("amount") != null)
                ? new BigDecimal(payload.get("amount").toString())
                : walletService.getOrCreateWallet(storeId).getAvailableBalance();
        String note = (payload != null && payload.get("note") != null)
                ? payload.get("note").toString()
                : "Giai ngan toan bo so du";

        WalletTransaction transaction = walletService.withdraw(storeId, amount, note);
        return ResponseEntity.ok(toResponse(transaction));
    }

    // ─── Payout Request Endpoints ──────────────────────────────────────────────

    @PostMapping("/my-payout")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<PayoutRequestResponse> createPayoutRequest(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody PayoutRequestCreateRequest requestBody) {
        UserContext ctx = authContext.requireVendor(authHeader);

        PayoutRequest request = walletService.createPayoutRequest(
                ctx.getStoreId(),
                requestBody.getAmount(),
                requestBody.getBankAccountName(),
                requestBody.getBankAccountNumber(),
                requestBody.getBankName());

        return ResponseEntity.ok(toPayoutResponse(request));
    }

    @GetMapping("/my-payouts")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Page<PayoutRequestResponse>> getMyPayouts(
            @RequestHeader("Authorization") String authHeader,
            Pageable pageable) {
        UserContext ctx = authContext.requireVendor(authHeader);
        Page<PayoutRequest> payouts = walletService.getStorePayouts(ctx.getStoreId(), pageable);
        return ResponseEntity.ok(payouts.map(this::toPayoutResponse));
    }

    @GetMapping("/payouts/pending")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Page<PayoutRequestResponse>> getPendingPayouts(Pageable pageable) {
        Page<PayoutRequest> payouts = walletService.getPendingPayouts(pageable);
        return ResponseEntity.ok(payouts.map(this::toPayoutResponse));
    }

    @PostMapping("/payouts/{id}/approve")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<PayoutRequestResponse> approvePayout(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable UUID id) {
        UserContext ctx = authContext.requireAdmin(authHeader);
        PayoutRequest request = walletService.approvePayoutRequest(id, ctx.getUserId(), ctx.getEmail());
        return ResponseEntity.ok(toPayoutResponse(request));
    }

    @PostMapping("/payouts/{id}/reject")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<PayoutRequestResponse> rejectPayout(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable UUID id,
            @RequestBody Map<String, String> payload) {
        UserContext ctx = authContext.requireAdmin(authHeader);
        String note = payload.getOrDefault("note", "");
        PayoutRequest request = walletService.rejectPayoutRequest(id, ctx.getUserId(), ctx.getEmail(), note);
        return ResponseEntity.ok(toPayoutResponse(request));
    }

    @GetMapping("/payouts/summary")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> getPayoutSummary() {
        return ResponseEntity.ok(Map.of(
                "pendingCount", walletService.getPendingPayoutCount(),
                "pendingTotal", walletService.getPendingPayoutTotal()));
    }

    // ─── Mappers ───────────────────────────────────────────────────────────────

    private WalletResponse toResponse(VendorWallet wallet) {
        Store store = storeRepository.findById(wallet.getStoreId()).orElse(null);
        String storeName = store != null ? store.getName() : "Unknown Store";
        String storeSlug = store != null ? store.getSlug() : null;
        String storeLogo = store != null ? store.getLogo() : null;

        return WalletResponse.builder()
                .id(wallet.getId())
                .storeId(wallet.getStoreId())
                .storeName(storeName)
                .storeSlug(storeSlug)
                .storeLogo(storeLogo)
                .availableBalance(wallet.getAvailableBalance())
                .frozenBalance(wallet.getFrozenBalance())
                .reservedBalance(wallet.getReservedBalance())
                .totalBalance(wallet.getTotalBalance())
                .lastUpdated(wallet.getLastUpdated())
                .build();
    }

    private WalletTransactionResponse toResponse(WalletTransaction transaction) {
        return WalletTransactionResponse.builder()
                .id(transaction.getId())
                .code(transaction.getTransactionCode())
                .walletId(transaction.getWallet().getId())
                .orderId(transaction.getOrderId())
                .amount(transaction.getAmount())
                .type(transaction.getType())
                .description(transaction.getDescription())
                .createdAt(transaction.getCreatedAt())
                .build();
    }

    private PayoutRequestResponse toPayoutResponse(PayoutRequest request) {
        Store store = storeRepository.findById(request.getStoreId()).orElse(null);
        return PayoutRequestResponse.builder()
                .id(request.getId())
                .storeId(request.getStoreId())
                .storeName(store != null ? store.getName() : "Unknown Store")
                .storeSlug(store != null ? store.getSlug() : null)
                .storeLogo(store != null ? store.getLogo() : null)
                .amount(request.getAmount())
                .bankAccountName(request.getBankAccountName())
                .bankAccountNumber(request.getBankAccountNumber())
                .bankName(request.getBankName())
                .status(request.getStatus().name())
                .adminNote(request.getAdminNote())
                .processedBy(request.getProcessedBy())
                .processedAt(request.getProcessedAt())
                .createdAt(request.getCreatedAt())
                .build();
    }
}
