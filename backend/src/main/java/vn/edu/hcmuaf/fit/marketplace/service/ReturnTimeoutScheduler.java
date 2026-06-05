package vn.edu.hcmuaf.fit.marketplace.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnRequestRepository;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class ReturnTimeoutScheduler {
    private static final Logger log = LoggerFactory.getLogger(ReturnTimeoutScheduler.class);

    private final ReturnRequestRepository returnRequestRepository;
    private final ReturnRequestService returnRequestService;

    public ReturnTimeoutScheduler(ReturnRequestRepository returnRequestRepository,
            ReturnRequestService returnRequestService) {
        this.returnRequestRepository = returnRequestRepository;
        this.returnRequestService = returnRequestService;
    }

    /**
     * Auto-approve return requests if seller doesn't respond within 48 hours.
     * This protects customers from delayed responses and ensures timely refunds.
     */
    @Scheduled(cron = "0 0 * * * *") // Every hour
    @Transactional
    public void processReturnTimeouts() {
        LocalDateTime now = LocalDateTime.now();
        List<ReturnRequest> timedOutRequests = returnRequestRepository
                .findByStatusAndSellerDeadlineAtBefore(ReturnRequest.ReturnStatus.DELIVERED_TO_SELLER, now);

        if (timedOutRequests.isEmpty()) {
            return;
        }

        log.info("Found {} return requests that exceeded seller deadline", timedOutRequests.size());
        int processed = 0;
        int failed = 0;

        for (ReturnRequest req : timedOutRequests) {
            try {
                log.info("Auto-approving return {} for store {} due to seller timeout",
                        req.getReturnCode(), req.getStoreId());
                returnRequestService.sellerApproveReturn(req.getId(), req.getStoreId(), "SYSTEM_TIMEOUT");
                processed++;
            } catch (Exception e) {
                failed++;
                log.error("Failed to auto-approve timed out return request {} ({}): {}",
                        req.getId(), req.getReturnCode(), e.getMessage(), e);
            }
        }

        log.info("Seller deadline processing complete: {} approved, {} failed", processed, failed);
    }
}
