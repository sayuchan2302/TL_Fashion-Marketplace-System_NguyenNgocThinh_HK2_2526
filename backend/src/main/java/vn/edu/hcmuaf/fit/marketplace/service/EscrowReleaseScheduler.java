package vn.edu.hcmuaf.fit.marketplace.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class EscrowReleaseScheduler {
    private static final Logger log = LoggerFactory.getLogger(EscrowReleaseScheduler.class);

    private final OrderRepository orderRepository;
    private final WalletService walletService;

    public EscrowReleaseScheduler(OrderRepository orderRepository,
            WalletService walletService) {
        this.orderRepository = orderRepository;
        this.walletService = walletService;
    }

    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void releaseMaturedEscrow() {
        LocalDateTime now = LocalDateTime.now();
        List<Order> matureOrders = orderRepository.findByStatusAndEscrowDeadlineAtBefore(Order.OrderStatus.DELIVERED,
                now);

        int released = 0;
        for (Order order : matureOrders) {
            if (order.getStoreId() == null)
                continue;

            try {
                walletService.releaseEscrowToAvailable(order.getStoreId(), order.getId(), order.getVendorPayout());

                order.setEscrowDeadlineAt(null);
                order.setEscrowRemainingSeconds(null);
                orderRepository.save(order);
                released++;
            } catch (Exception e) {
                log.error("Failed to release escrow for order {}: {}", order.getId(), e.getMessage());
            }
        }

        if (released > 0) {
            log.info("Escrow release job completed: {} orders released.", released);
        }
    }
}
