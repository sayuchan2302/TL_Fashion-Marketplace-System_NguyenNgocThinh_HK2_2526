package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.WalletTransaction;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.WalletTransactionRepository;

import java.util.List;

@Component
public class PublicCodeBackfillInitializer {

    private final OrderRepository orderRepository;
    private final ReturnRequestRepository returnRequestRepository;
    private final WalletTransactionRepository walletTransactionRepository;
    private final PublicCodeService publicCodeService;
    private final JdbcTemplate jdbcTemplate;

    public PublicCodeBackfillInitializer(
            OrderRepository orderRepository,
            ReturnRequestRepository returnRequestRepository,
            WalletTransactionRepository walletTransactionRepository,
            PublicCodeService publicCodeService,
            JdbcTemplate jdbcTemplate
    ) {
        this.orderRepository = orderRepository;
        this.returnRequestRepository = returnRequestRepository;
        this.walletTransactionRepository = walletTransactionRepository;
        this.publicCodeService = publicCodeService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void backfillMissingPublicCodes() {
        normalizeReturnRequestStatuses();
        refreshReturnRequestStatusConstraint();
        refreshOrderStatusConstraint();
        backfillOrders();
        backfillReturnRequests();
        backfillWalletTransactions();
    }

    private void normalizeReturnRequestStatuses() {
        jdbcTemplate.execute("""
                UPDATE return_requests
                SET status = CASE status
                    WHEN 'ACCEPTED' THEN 'REQUESTED'
                    WHEN 'SHIPPING' THEN 'IN_TRANSIT'
                    WHEN 'RECEIVED' THEN 'DELIVERED_TO_SELLER'
                    WHEN 'COMPLETED' THEN 'REFUND_SUCCESS'
                    WHEN 'REJECTED' THEN 'RETURN_REJECTED'
                    WHEN 'DISPUTED' THEN 'DISPUTING'
                    ELSE status
                END
                WHERE status IN ('ACCEPTED', 'SHIPPING', 'RECEIVED', 'COMPLETED', 'REJECTED', 'DISPUTED')
                """);
    }

    private void refreshReturnRequestStatusConstraint() {
        jdbcTemplate.execute("""
                ALTER TABLE IF EXISTS return_requests
                DROP CONSTRAINT IF EXISTS return_requests_status_check
                """);
        jdbcTemplate.execute("""
                ALTER TABLE IF EXISTS return_requests
                ADD CONSTRAINT return_requests_status_check
                CHECK (
                    status IN (
                        'REQUESTED',
                        'IN_TRANSIT',
                        'DELIVERED_TO_SELLER',
                        'REFUND_SUCCESS',
                        'DISPUTING',
                        'RETURN_REJECTED',
                        'CANCELLED'
                    )
                )
                """);
    }

    private void refreshOrderStatusConstraint() {
        jdbcTemplate.execute("""
                ALTER TABLE IF EXISTS orders
                DROP CONSTRAINT IF EXISTS orders_status_check
                """);
        jdbcTemplate.execute("""
                ALTER TABLE IF EXISTS orders
                DROP CONSTRAINT IF EXISTS orders_status_check1
                """);
        jdbcTemplate.execute("""
                ALTER TABLE IF EXISTS orders
                ADD CONSTRAINT orders_status_check
                CHECK (
                    status IN (
                        'PENDING',
                        'WAITING_FOR_VENDOR',
                        'CONFIRMED',
                        'PROCESSING',
                        'SHIPPED',
                        'DELIVERED',
                        'COMPLETED',
                        'CANCELLED',
                        'RETURNING'
                    )
                )
                """);
    }

    private void backfillOrders() {
        List<Order> missingOrders = orderRepository.findByOrderCodeIsNullOrderByCreatedAtAscIdAsc();
        if (missingOrders.isEmpty()) {
            return;
        }
        for (Order order : missingOrders) {
            publicCodeService.assignOrderCodeIfMissing(order);
        }
        orderRepository.saveAll(missingOrders);
    }

    private void backfillReturnRequests() {
        List<ReturnRequest> missingRequests = returnRequestRepository.findByReturnCodeIsNullOrderByCreatedAtAscIdAsc();
        if (missingRequests.isEmpty()) {
            return;
        }
        for (ReturnRequest request : missingRequests) {
            publicCodeService.assignReturnCodeIfMissing(request);
        }
        returnRequestRepository.saveAll(missingRequests);
    }

    private void backfillWalletTransactions() {
        List<WalletTransaction> missingTransactions = walletTransactionRepository.findByTransactionCodeIsNullOrderByCreatedAtAscIdAsc();
        if (missingTransactions.isEmpty()) {
            return;
        }
        for (WalletTransaction transaction : missingTransactions) {
            publicCodeService.assignTransactionCodeIfMissing(transaction);
        }
        walletTransactionRepository.saveAll(missingTransactions);
    }
}
