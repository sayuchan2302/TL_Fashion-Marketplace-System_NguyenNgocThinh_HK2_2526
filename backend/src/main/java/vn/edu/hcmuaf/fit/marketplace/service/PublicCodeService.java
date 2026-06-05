package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.PublicCodeType;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.WalletTransaction;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.WalletTransactionRepository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

@Service
public class PublicCodeService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyMMdd");
    private static final int MAX_SEQUENCE_RETRY = 5;

    private final OrderRepository orderRepository;
    private final ReturnRequestRepository returnRequestRepository;
    private final WalletTransactionRepository walletTransactionRepository;
    private final PublicCodeCounterService publicCodeCounterService;

    public PublicCodeService(
            OrderRepository orderRepository,
            ReturnRequestRepository returnRequestRepository,
            WalletTransactionRepository walletTransactionRepository,
            PublicCodeCounterService publicCodeCounterService) {
        this.orderRepository = orderRepository;
        this.returnRequestRepository = returnRequestRepository;
        this.walletTransactionRepository = walletTransactionRepository;
        this.publicCodeCounterService = publicCodeCounterService;
    }

    @Transactional
    public String nextOrderCode() {
        return nextCode(PublicCodeType.ORDER, null);
    }

    @Transactional
    public String nextOrderCode(LocalDateTime referenceDateTime) {
        return nextCode(PublicCodeType.ORDER, referenceDateTime);
    }

    @Transactional
    public String nextReturnCode() {
        return nextCode(PublicCodeType.RETURN, null);
    }

    @Transactional
    public String nextReturnCode(LocalDateTime referenceDateTime) {
        return nextCode(PublicCodeType.RETURN, referenceDateTime);
    }

    @Transactional
    public String nextTransactionCode() {
        return nextCode(PublicCodeType.TRANSACTION, null);
    }

    @Transactional
    public String nextTransactionCode(LocalDateTime referenceDateTime) {
        return nextCode(PublicCodeType.TRANSACTION, referenceDateTime);
    }

    @Transactional
    public void assignOrderCodeIfMissing(Order order) {
        if (order == null || hasText(order.getOrderCode())) {
            return;
        }
        order.setOrderCode(nextOrderCode(order.getCreatedAt()));
    }

    @Transactional
    public void assignReturnCodeIfMissing(ReturnRequest request) {
        if (request == null || hasText(request.getReturnCode())) {
            return;
        }
        request.setReturnCode(nextReturnCode(request.getCreatedAt()));
    }

    @Transactional
    public void assignTransactionCodeIfMissing(WalletTransaction transaction) {
        if (transaction == null || hasText(transaction.getTransactionCode())) {
            return;
        }
        transaction.setTransactionCode(nextTransactionCode(transaction.getCreatedAt()));
    }

    private String nextCode(PublicCodeType type, LocalDateTime referenceDateTime) {
        LocalDate codeDate = resolveBusinessDate(referenceDateTime);
        long nextSequence = reserveSequence(type, codeDate);
        return "%s-%s-%06d".formatted(prefix(type), codeDate.format(DATE_FORMATTER), nextSequence);
    }

    private LocalDate resolveBusinessDate(LocalDateTime referenceDateTime) {
        if (referenceDateTime == null) {
            return LocalDate.now(BUSINESS_ZONE);
        }
        return referenceDateTime.atZone(BUSINESS_ZONE).toLocalDate();
    }

    private long reserveSequence(PublicCodeType type, LocalDate codeDate) {
        long defaultValue = resolveExistingMaxSequence(type, codeDate);
        for (int attempt = 0; attempt < MAX_SEQUENCE_RETRY; attempt++) {
            try {
                return publicCodeCounterService.reserve(type, codeDate, defaultValue);
            } catch (DataIntegrityViolationException ex) {
                // Row created concurrently by another transaction, catch and retry with lock.
            }
        }
        throw new IllegalStateException("Unable to allocate public code sequence for " + type + " at " + codeDate);
    }

    private long resolveExistingMaxSequence(PublicCodeType type, LocalDate codeDate) {
        String prefixWithDate = "%s-%s-".formatted(prefix(type), codeDate.format(DATE_FORMATTER));
        switch (type) {
            case ORDER:
                return orderRepository.findTopByOrderCodeStartingWithOrderByOrderCodeDesc(prefixWithDate)
                        .map(Order::getOrderCode)
                        .map(this::parseSequence)
                        .orElse(0L);
            case RETURN:
                return returnRequestRepository.findTopByReturnCodeStartingWithOrderByReturnCodeDesc(prefixWithDate)
                        .map(ReturnRequest::getReturnCode)
                        .map(this::parseSequence)
                        .orElse(0L);
            case TRANSACTION:
                return walletTransactionRepository
                        .findTopByTransactionCodeStartingWithOrderByTransactionCodeDesc(prefixWithDate)
                        .map(WalletTransaction::getTransactionCode)
                        .map(this::parseSequence)
                        .orElse(0L);
            default:
                throw new IllegalArgumentException("Unknown type: " + type);
        }
    }

    private long parseSequence(String code) {
        if (!hasText(code)) {
            return 0L;
        }
        int index = code.lastIndexOf('-');
        if (index < 0 || index >= code.length() - 1) {
            return 0L;
        }
        try {
            return Long.parseLong(code.substring(index + 1));
        } catch (NumberFormatException ex) {
            return 0L;
        }
    }

    private String prefix(PublicCodeType type) {
        switch (type) {
            case ORDER:
                return "DH";
            case RETURN:
                return "TH";
            case TRANSACTION:
                return "GD";
            default:
                throw new IllegalArgumentException("Unknown type: " + type);
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
