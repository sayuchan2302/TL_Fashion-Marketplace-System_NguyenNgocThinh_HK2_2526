package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.entity.CustomerWallet;
import vn.edu.hcmuaf.fit.marketplace.entity.CustomerWalletTransaction;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.PayoutRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.VendorWallet;
import vn.edu.hcmuaf.fit.marketplace.entity.WalletTransaction;
import vn.edu.hcmuaf.fit.marketplace.exception.ForbiddenException;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;
import vn.edu.hcmuaf.fit.marketplace.repository.CustomerWalletRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.CustomerWalletTransactionRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.PayoutRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.VendorWalletRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.WalletTransactionRepository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
public class WalletService {
    private static final String UQ_WALLET_TX_ORDER_TYPE = "uq_wallet_tx_order_type";
    private static final String UQ_WALLET_TX_RETURN_TYPE = "uq_wallet_tx_return_type";
    private static final String UQ_CUSTOMER_WALLET_TX_RETURN_TYPE = "uq_customer_wallet_tx_return_type";

    private final OrderRepository orderRepository;
    private final VendorWalletRepository vendorWalletRepository;
    private final WalletTransactionRepository walletTransactionRepository;
    private final CustomerWalletRepository customerWalletRepository;
    private final CustomerWalletTransactionRepository customerWalletTransactionRepository;
    private final PayoutRequestRepository payoutRequestRepository;
    private final PublicCodeService publicCodeService;
    private final AdminAuditLogService adminAuditLogService;

    @Autowired
    public WalletService(OrderRepository orderRepository,
                         VendorWalletRepository vendorWalletRepository,
                         WalletTransactionRepository walletTransactionRepository,
                         CustomerWalletRepository customerWalletRepository,
                         CustomerWalletTransactionRepository customerWalletTransactionRepository,
                         PayoutRequestRepository payoutRequestRepository,
                         PublicCodeService publicCodeService,
                         AdminAuditLogService adminAuditLogService) {
        this.orderRepository = orderRepository;
        this.vendorWalletRepository = vendorWalletRepository;
        this.walletTransactionRepository = walletTransactionRepository;
        this.customerWalletRepository = customerWalletRepository;
        this.customerWalletTransactionRepository = customerWalletTransactionRepository;
        this.payoutRequestRepository = payoutRequestRepository;
        this.publicCodeService = publicCodeService;
        this.adminAuditLogService = adminAuditLogService;
    }

    public WalletService(OrderRepository orderRepository,
                         VendorWalletRepository vendorWalletRepository,
                         WalletTransactionRepository walletTransactionRepository,
                         CustomerWalletRepository customerWalletRepository,
                         CustomerWalletTransactionRepository customerWalletTransactionRepository,
                         PayoutRequestRepository payoutRequestRepository,
                         PublicCodeService publicCodeService) {
        this(
                orderRepository,
                vendorWalletRepository,
                walletTransactionRepository,
                customerWalletRepository,
                customerWalletTransactionRepository,
                payoutRequestRepository,
                publicCodeService,
                null
        );
    }

    // ─── Escrow Engine ─────────────────────────────────────────────────────────

    /**
     * When order is COMPLETED (customer clicks "Received"):
     * Calculate NetIncome = VendorPayout and add to frozenBalance.
     * Money is held in escrow for 7 days before becoming withdrawable.
     */
    @Transactional
    public void creditEscrowForCompletedOrder(Order order) {
        if (order == null || order.getId() == null) return;
        if (order.getStoreId() == null) return;

        BigDecimal inputNetIncome = order.getVendorPayout();
        if (inputNetIncome == null || inputNetIncome.compareTo(BigDecimal.ZERO) <= 0) return;

        Order lockedOrder = orderRepository.findByIdForUpdate(order.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Order not found"));

        if (lockedOrder.getStoreId() == null) return;

        if (walletTransactionRepository.existsByOrderIdAndType(
                lockedOrder.getId(),
                WalletTransaction.TransactionType.ESCROW_CREDIT
        )) return;

        BigDecimal netIncome = lockedOrder.getVendorPayout();
        if (netIncome == null || netIncome.compareTo(BigDecimal.ZERO) <= 0) return;

        VendorWallet wallet = vendorWalletRepository.findByStoreIdForUpdate(lockedOrder.getStoreId())
                .orElseGet(() -> createWallet(lockedOrder.getStoreId()));

        WalletTransaction transaction = WalletTransaction.builder()
                .transactionCode(publicCodeService.nextTransactionCode())
                .wallet(wallet)
                .orderId(lockedOrder.getId())
                .amount(netIncome)
                .type(WalletTransaction.TransactionType.ESCROW_CREDIT)
                .description("Escrow hold for Order " + (lockedOrder.getOrderCode() != null ? lockedOrder.getOrderCode() : lockedOrder.getId()))
                .build();

        try {
            walletTransactionRepository.save(transaction);
        } catch (DataIntegrityViolationException ex) {
            if (isUniqueConstraintViolation(ex, UQ_WALLET_TX_ORDER_TYPE)) return;
            throw ex;
        }

        wallet.setFrozenBalance(wallet.getFrozenBalance().add(netIncome));
        wallet.setLastUpdated(LocalDateTime.now());
        vendorWalletRepository.save(wallet);
    }

    /**
     * Scheduled task: Move matured escrow from frozenBalance to availableBalance.
     * Called after 7-day holding period.
     */
    @Transactional
    public void releaseEscrowToAvailable(UUID storeId, UUID orderId, BigDecimal amount) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) return;

        VendorWallet wallet = vendorWalletRepository.findByStoreIdForUpdate(storeId)
                .orElseThrow(() -> new ResourceNotFoundException("Wallet not found for store"));

        if (wallet.getFrozenBalance().compareTo(amount) < 0) {
            throw new IllegalArgumentException("Insufficient frozen balance for escrow release");
        }

        wallet.setFrozenBalance(wallet.getFrozenBalance().subtract(amount));
        wallet.setAvailableBalance(wallet.getAvailableBalance().add(amount));
        wallet.setLastUpdated(LocalDateTime.now());
        vendorWalletRepository.save(wallet);

        WalletTransaction transaction = WalletTransaction.builder()
                .transactionCode(publicCodeService.nextTransactionCode())
                .wallet(wallet)
                .orderId(orderId)
                .amount(amount)
                .type(WalletTransaction.TransactionType.ESCROW_RELEASE)
                .description("Escrow released to available balance")
                .build();

        walletTransactionRepository.save(transaction);
    }

    /**
     * Debit vendor when order is refunded. Deducts from frozenBalance first,
     * then availableBalance if frozen is insufficient.
     */
    @Transactional
    public void debitVendorForRefund(Order order) {
        if (order == null || order.getId() == null) return;

        Order lockedOrder = orderRepository.findByIdForUpdate(order.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Order not found"));

        if (lockedOrder.getStoreId() == null) return;

        if (!walletTransactionRepository.existsByOrderIdAndType(
                lockedOrder.getId(),
                WalletTransaction.TransactionType.ESCROW_CREDIT
        )) return;

        if (walletTransactionRepository.existsByOrderIdAndType(
                lockedOrder.getId(),
                WalletTransaction.TransactionType.REFUND_DEBIT
        )) return;

        VendorWallet wallet = vendorWalletRepository.findByStoreIdForUpdate(lockedOrder.getStoreId())
                .orElseGet(() -> createWallet(lockedOrder.getStoreId()));

        BigDecimal amount = lockedOrder.getVendorPayout();
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) return;

        BigDecimal remaining = amount;

        if (wallet.getFrozenBalance().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal fromFrozen = wallet.getFrozenBalance().min(remaining);
            wallet.setFrozenBalance(wallet.getFrozenBalance().subtract(fromFrozen));
            remaining = remaining.subtract(fromFrozen);
        }

        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            if (wallet.getAvailableBalance().compareTo(remaining) < 0) {
                throw new IllegalArgumentException("Insufficient wallet balance for refund");
            }
            wallet.setAvailableBalance(wallet.getAvailableBalance().subtract(remaining));
        }

        wallet.setLastUpdated(LocalDateTime.now());
        vendorWalletRepository.save(wallet);

        WalletTransaction transaction = WalletTransaction.builder()
                .transactionCode(publicCodeService.nextTransactionCode())
                .wallet(wallet)
                .orderId(lockedOrder.getId())
                .amount(amount)
                .type(WalletTransaction.TransactionType.REFUND_DEBIT)
                .description("Refund debit for Order " + (lockedOrder.getOrderCode() != null ? lockedOrder.getOrderCode() : lockedOrder.getId()))
                .build();

        walletTransactionRepository.save(transaction);
    }

    @Transactional
    public void debitVendorForReturnRefund(
            UUID returnRequestId,
            Order order,
            BigDecimal refundAmount,
            String reason
    ) {
        if (returnRequestId == null || order == null || order.getId() == null) return;
        if (refundAmount == null || refundAmount.compareTo(BigDecimal.ZERO) <= 0) return;

        if (walletTransactionRepository.existsByReturnRequestIdAndType(
                returnRequestId,
                WalletTransaction.TransactionType.RETURN_REFUND_DEBIT
        )) {
            return;
        }

        Order lockedOrder = orderRepository.findByIdForUpdate(order.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Order not found"));

        if (lockedOrder.getStoreId() == null) {
            throw new ForbiddenException("Order does not belong to a vendor store");
        }

        if (walletTransactionRepository.existsByReturnRequestIdAndType(
                returnRequestId,
                WalletTransaction.TransactionType.RETURN_REFUND_DEBIT
        )) {
            return;
        }

        VendorWallet wallet = vendorWalletRepository.findByStoreIdForUpdate(lockedOrder.getStoreId())
                .orElseGet(() -> createWallet(lockedOrder.getStoreId()));

        BigDecimal total = wallet.getFrozenBalance().add(wallet.getAvailableBalance());
        if (total.compareTo(refundAmount) < 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Insufficient vendor wallet balance for return refund"
            );
        }

        BigDecimal remaining = refundAmount;
        BigDecimal newFrozen = wallet.getFrozenBalance();
        BigDecimal newAvailable = wallet.getAvailableBalance();
        if (newFrozen.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal fromFrozen = newFrozen.min(remaining);
            newFrozen = newFrozen.subtract(fromFrozen);
            remaining = remaining.subtract(fromFrozen);
        }
        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            newAvailable = newAvailable.subtract(remaining);
        }

        WalletTransaction transaction = WalletTransaction.builder()
                .transactionCode(publicCodeService.nextTransactionCode())
                .wallet(wallet)
                .orderId(lockedOrder.getId())
                .returnRequestId(returnRequestId)
                .amount(refundAmount)
                .type(WalletTransaction.TransactionType.RETURN_REFUND_DEBIT)
                .description(reason == null || reason.isBlank()
                        ? "Return refund debit for Order " + (lockedOrder.getOrderCode() != null ? lockedOrder.getOrderCode() : lockedOrder.getId())
                        : reason.trim())
                .build();
        try {
            walletTransactionRepository.save(transaction);
        } catch (DataIntegrityViolationException ex) {
            if (isUniqueConstraintViolation(ex, UQ_WALLET_TX_RETURN_TYPE)) return;
            throw ex;
        }

        wallet.setFrozenBalance(newFrozen);
        wallet.setAvailableBalance(newAvailable);
        wallet.setLastUpdated(LocalDateTime.now());
        vendorWalletRepository.save(wallet);
    }

    // ─── Payout System ─────────────────────────────────────────────────────────

    @Transactional
    public PayoutRequest createPayoutRequest(UUID storeId, BigDecimal amount,
                                              String bankAccountName, String bankAccountNumber, String bankName) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Payout amount must be greater than zero");
        }
        if (bankAccountName == null || bankAccountName.trim().isEmpty()) {
            throw new IllegalArgumentException("Bank account holder is required");
        }
        if (bankAccountNumber == null || bankAccountNumber.trim().isEmpty()) {
            throw new IllegalArgumentException("Bank account number is required");
        }
        if (bankName == null || bankName.trim().isEmpty()) {
            throw new IllegalArgumentException("Bank name is required");
        }

        VendorWallet wallet = getOrCreateWallet(storeId);
        BigDecimal pendingAmount = payoutRequestRepository.sumPendingAmountByStoreId(storeId);
        BigDecimal spendableBase = wallet.getAvailableBalance().add(wallet.getReservedBalance());

        if (pendingAmount.compareTo(BigDecimal.ZERO) > 0) {
            throw new IllegalArgumentException("Store already has a pending payout request");
        }

        if (wallet.getAvailableBalance().compareTo(amount) < 0) {
            throw new IllegalArgumentException("Insufficient available balance. Available: " + wallet.getAvailableBalance());
        }
        if (pendingAmount.add(amount).compareTo(spendableBase) > 0) {
            throw new IllegalArgumentException("Insufficient available balance after pending payouts");
        }

        wallet.setAvailableBalance(wallet.getAvailableBalance().subtract(amount));
        wallet.setReservedBalance(wallet.getReservedBalance().add(amount));
        wallet.setLastUpdated(LocalDateTime.now());
        vendorWalletRepository.save(wallet);

        PayoutRequest request = PayoutRequest.builder()
                .storeId(storeId)
                .amount(amount)
                .bankAccountName(bankAccountName.trim())
                .bankAccountNumber(bankAccountNumber.trim())
                .bankName(bankName.trim())
                .status(PayoutRequest.PayoutStatus.PENDING)
                .build();

        return payoutRequestRepository.save(request);
    }

    @Transactional
    public PayoutRequest approvePayoutRequest(UUID payoutRequestId, UUID adminId) {
        return approvePayoutRequest(payoutRequestId, adminId, null);
    }

    @Transactional
    public PayoutRequest approvePayoutRequest(UUID payoutRequestId, UUID adminId, String adminEmail) {
        try {
            PayoutRequest request = payoutRequestRepository.findByIdForUpdate(payoutRequestId)
                    .orElseThrow(() -> new ResourceNotFoundException("Payout request not found"));

            if (request.getStatus() != PayoutRequest.PayoutStatus.PENDING) {
                throw new IllegalStateException("Payout request is not pending");
            }

            VendorWallet wallet = vendorWalletRepository.findByStoreIdForUpdate(request.getStoreId())
                    .orElseThrow(() -> new ResourceNotFoundException("Wallet not found"));

            if (wallet.getReservedBalance().compareTo(request.getAmount()) < 0) {
                throw new IllegalArgumentException("Insufficient reserved balance for payout approval");
            }

            wallet.setReservedBalance(wallet.getReservedBalance().subtract(request.getAmount()));
            wallet.setLastUpdated(LocalDateTime.now());
            vendorWalletRepository.save(wallet);

            request.setStatus(PayoutRequest.PayoutStatus.APPROVED);
            request.setProcessedBy(adminId);
            request.setProcessedAt(LocalDateTime.now());
            payoutRequestRepository.save(request);

            WalletTransaction transaction = WalletTransaction.builder()
                    .transactionCode(publicCodeService.nextTransactionCode())
                    .wallet(wallet)
                    .amount(request.getAmount())
                    .type(WalletTransaction.TransactionType.PAYOUT_DEBIT)
                    .description("Payout approved: " + request.getId())
                    .build();
            walletTransactionRepository.save(transaction);

            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "PAYOUT",
                    "APPROVE_PAYOUT",
                    request.getId(),
                    true,
                    "Approved payout request for store " + request.getStoreId()
            );
            return request;
        } catch (RuntimeException ex) {
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "PAYOUT",
                    "APPROVE_PAYOUT",
                    payoutRequestId,
                    false,
                    ex.getMessage()
            );
            throw ex;
        }
    }

    @Transactional
    public PayoutRequest rejectPayoutRequest(UUID payoutRequestId, UUID adminId, String note) {
        return rejectPayoutRequest(payoutRequestId, adminId, null, note);
    }

    @Transactional
    public PayoutRequest rejectPayoutRequest(UUID payoutRequestId, UUID adminId, String adminEmail, String note) {
        try {
            PayoutRequest request = payoutRequestRepository.findByIdForUpdate(payoutRequestId)
                    .orElseThrow(() -> new ResourceNotFoundException("Payout request not found"));

            if (request.getStatus() != PayoutRequest.PayoutStatus.PENDING) {
                throw new IllegalStateException("Payout request is not pending");
            }

            VendorWallet wallet = vendorWalletRepository.findByStoreIdForUpdate(request.getStoreId())
                    .orElseThrow(() -> new ResourceNotFoundException("Wallet not found"));

            if (wallet.getReservedBalance().compareTo(request.getAmount()) < 0) {
                throw new IllegalArgumentException("Insufficient reserved balance for payout rejection");
            }
            wallet.setReservedBalance(wallet.getReservedBalance().subtract(request.getAmount()));
            wallet.setAvailableBalance(wallet.getAvailableBalance().add(request.getAmount()));
            wallet.setLastUpdated(LocalDateTime.now());
            vendorWalletRepository.save(wallet);

            request.setStatus(PayoutRequest.PayoutStatus.REJECTED);
            request.setAdminNote(note);
            request.setProcessedBy(adminId);
            request.setProcessedAt(LocalDateTime.now());

            PayoutRequest saved = payoutRequestRepository.save(request);
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "PAYOUT",
                    "REJECT_PAYOUT",
                    saved.getId(),
                    true,
                    note
            );
            return saved;
        } catch (RuntimeException ex) {
            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    "PAYOUT",
                    "REJECT_PAYOUT",
                    payoutRequestId,
                    false,
                    ex.getMessage()
            );
            throw ex;
        }
    }

    // ─── Wallet Queries ────────────────────────────────────────────────────────

    private VendorWallet createWallet(UUID storeId) {
        return vendorWalletRepository.save(VendorWallet.builder()
                .storeId(storeId)
                .availableBalance(BigDecimal.ZERO)
                .frozenBalance(BigDecimal.ZERO)
                .reservedBalance(BigDecimal.ZERO)
                .lastUpdated(LocalDateTime.now())
                .build());
    }

    @Transactional(readOnly = true)
    public VendorWallet getWallet(UUID storeId) {
        return vendorWalletRepository.findByStoreId(storeId)
                .orElseThrow(() -> new ResourceNotFoundException("Wallet not found"));
    }

    @Transactional
    public VendorWallet getOrCreateWallet(UUID storeId) {
        return vendorWalletRepository.findByStoreIdForUpdate(storeId)
                .orElseGet(() -> createWallet(storeId));
    }

    @Transactional(readOnly = true)
    public Page<VendorWallet> getAllWalletsPageable(String keyword, Pageable pageable) {
        return vendorWalletRepository.searchAll(
                keyword == null || keyword.isBlank() ? null : keyword.trim(), pageable);
    }

    @Transactional
    public Page<WalletTransaction> getTransactions(UUID storeId, Pageable pageable) {
        VendorWallet wallet = getOrCreateWallet(storeId);
        return walletTransactionRepository.findByWalletId(wallet.getId(), pageable);
    }

    @Transactional(readOnly = true)
    public Page<PayoutRequest> getPendingPayouts(Pageable pageable) {
        return payoutRequestRepository.findByStatus(PayoutRequest.PayoutStatus.PENDING, pageable);
    }

    @Transactional(readOnly = true)
    public Page<PayoutRequest> getStorePayouts(UUID storeId, Pageable pageable) {
        return payoutRequestRepository.findByStoreId(storeId, pageable);
    }

    @Transactional(readOnly = true)
    public long getPendingPayoutCount() {
        return payoutRequestRepository.countByStatus(PayoutRequest.PayoutStatus.PENDING);
    }

    @Transactional(readOnly = true)
    public BigDecimal getPendingPayoutTotal() {
        return payoutRequestRepository.sumPendingAmount();
    }

    // ─── Legacy: Full withdrawal (for admin) ───────────────────────────────────

    @Transactional
    public WalletTransaction withdraw(UUID storeId, BigDecimal amount, String note) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Withdrawal amount must be greater than zero");
        }

        VendorWallet wallet = vendorWalletRepository.findByStoreIdForUpdate(storeId)
                .orElseThrow(() -> new IllegalArgumentException("Wallet not found"));

        BigDecimal remaining = amount;

        if (wallet.getAvailableBalance().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal fromAvailable = wallet.getAvailableBalance().min(remaining);
            wallet.setAvailableBalance(wallet.getAvailableBalance().subtract(fromAvailable));
            remaining = remaining.subtract(fromAvailable);
        }

        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            throw new IllegalArgumentException("Insufficient available balance for withdrawal");
        }

        wallet.setLastUpdated(LocalDateTime.now());
        vendorWalletRepository.save(wallet);

        WalletTransaction transaction = WalletTransaction.builder()
                .transactionCode(publicCodeService.nextTransactionCode())
                .wallet(wallet)
                .amount(amount)
                .type(WalletTransaction.TransactionType.WITHDRAWAL)
                .description(note != null ? note : "Admin withdrawal")
                .build();

        return walletTransactionRepository.save(transaction);
    }

    // ─── Customer Wallet ───────────────────────────────────────────────────────

    @Transactional
    public void refundToCustomerFromEscrow(UUID returnRequestId, Order order, BigDecimal refundAmount, String reason) {
        if (returnRequestId == null || order == null || order.getId() == null) return;
        if (refundAmount == null || refundAmount.compareTo(BigDecimal.ZERO) <= 0) return;

        Order lockedOrder = orderRepository.findByIdForUpdate(order.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Order not found"));

        if (lockedOrder.getUser() == null || lockedOrder.getUser().getId() == null) {
            throw new ForbiddenException("Order does not contain a valid customer");
        }

        boolean alreadyProcessed = customerWalletTransactionRepository.existsByReturnRequestIdAndType(
                returnRequestId,
                CustomerWalletTransaction.TransactionType.CREDIT_REFUND
        );
        if (alreadyProcessed) return;

        CustomerWallet wallet = customerWalletRepository.findByUserId(lockedOrder.getUser().getId())
                .orElseGet(() -> createCustomerWallet(lockedOrder.getUser().getId()));

        BigDecimal orderTotal = lockedOrder.getTotal() == null ? BigDecimal.ZERO : lockedOrder.getTotal().max(BigDecimal.ZERO);
        BigDecimal refundedBefore = customerWalletTransactionRepository.sumAmountByOrderIdAndType(
                lockedOrder.getId(),
                CustomerWalletTransaction.TransactionType.CREDIT_REFUND
        );
        BigDecimal refundedAfter = refundedBefore.add(refundAmount);
        if (orderTotal.compareTo(BigDecimal.ZERO) > 0 && refundedAfter.compareTo(orderTotal) > 0) {
            throw new IllegalArgumentException("Refund amount exceeds escrow balance for this order");
        }

        CustomerWalletTransaction transaction = CustomerWalletTransaction.builder()
                .transactionCode(publicCodeService.nextTransactionCode())
                .wallet(wallet)
                .orderId(lockedOrder.getId())
                .returnRequestId(returnRequestId)
                .amount(refundAmount)
                .type(CustomerWalletTransaction.TransactionType.CREDIT_REFUND)
                .description(reason == null || reason.isBlank()
                        ? "Refund from escrow for Order " + (lockedOrder.getOrderCode() != null ? lockedOrder.getOrderCode() : lockedOrder.getId())
                        : reason.trim())
                .build();
        try {
            customerWalletTransactionRepository.save(transaction);
        } catch (DataIntegrityViolationException ex) {
            if (isUniqueConstraintViolation(ex, UQ_CUSTOMER_WALLET_TX_RETURN_TYPE)) return;
            throw ex;
        }

        wallet.setBalance(wallet.getBalance().add(refundAmount));
        wallet.setLastUpdated(LocalDateTime.now());
        customerWalletRepository.save(wallet);

        if (orderTotal.compareTo(BigDecimal.ZERO) > 0 && refundedAfter.compareTo(orderTotal) >= 0) {
            lockedOrder.setPaymentStatus(Order.PaymentStatus.REFUNDED);
        } else {
            lockedOrder.setPaymentStatus(Order.PaymentStatus.REFUND_PENDING);
        }
        orderRepository.save(lockedOrder);
    }

    @Transactional
    public void refundCommissionToVendor(UUID returnRequestId, Order order) {
        if (returnRequestId == null || order == null || order.getId() == null) return;
        BigDecimal commissionFee = order.getCommissionFee();
        if (commissionFee == null || commissionFee.compareTo(BigDecimal.ZERO) <= 0) return;

        if (walletTransactionRepository.existsByReturnRequestIdAndType(
                returnRequestId,
                WalletTransaction.TransactionType.COMMISSION_REFUND
        )) {
            return;
        }

        Order lockedOrder = orderRepository.findByIdForUpdate(order.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Order not found"));

        if (lockedOrder.getStoreId() == null) {
            throw new ForbiddenException("Order does not belong to a vendor store");
        }

        if (walletTransactionRepository.existsByReturnRequestIdAndType(
                returnRequestId,
                WalletTransaction.TransactionType.COMMISSION_REFUND
        )) {
            return;
        }

        VendorWallet wallet = vendorWalletRepository.findByStoreIdForUpdate(lockedOrder.getStoreId())
                .orElseGet(() -> createWallet(lockedOrder.getStoreId()));

        WalletTransaction transaction = WalletTransaction.builder()
                .transactionCode(publicCodeService.nextTransactionCode())
                .wallet(wallet)
                .orderId(lockedOrder.getId())
                .returnRequestId(returnRequestId)
                .amount(commissionFee)
                .type(WalletTransaction.TransactionType.COMMISSION_REFUND)
                .description("Commission refund for return of Order "
                        + (lockedOrder.getOrderCode() != null ? lockedOrder.getOrderCode() : lockedOrder.getId()))
                .build();
        try {
            walletTransactionRepository.save(transaction);
        } catch (DataIntegrityViolationException ex) {
            if (isUniqueConstraintViolation(ex, UQ_WALLET_TX_RETURN_TYPE)) return;
            throw ex;
        }

        wallet.setAvailableBalance(wallet.getAvailableBalance().add(commissionFee));
        wallet.setLastUpdated(LocalDateTime.now());
        vendorWalletRepository.save(wallet);
    }

    private CustomerWallet createCustomerWallet(UUID userId) {
        return customerWalletRepository.save(CustomerWallet.builder()
                .userId(userId)
                .balance(BigDecimal.ZERO)
                .lastUpdated(LocalDateTime.now())
                .build());
    }

    private boolean isUniqueConstraintViolation(DataIntegrityViolationException ex, String constraintName) {
        if (ex == null || constraintName == null || constraintName.isBlank()) return false;
        Throwable current = ex;
        while (current != null) {
            String message = current.getMessage();
            if (message != null && message.toLowerCase().contains(constraintName.toLowerCase())) return true;
            current = current.getCause();
        }
        return false;
    }

    private void writeAdminAuditLog(
            UUID actorId,
            String actorEmail,
            String domain,
            String action,
            UUID targetId,
            boolean success,
            String note
    ) {
        if (adminAuditLogService == null) return;
        adminAuditLogService.logAction(actorId, actorEmail, domain, action, targetId, success, note);
    }
}
