package vn.edu.hcmuaf.fit.marketplace.service;

import java.math.BigDecimal;
import java.time.LocalDate;

public record AnalyticsDailyValue(
        LocalDate date,
        BigDecimal grossRevenue,
        BigDecimal payout,
        BigDecimal commission,
        long orders
) {
}
