package vn.edu.hcmuaf.fit.marketplace.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;

public record AnalyticsRange(LocalDate from, LocalDate to, AnalyticsBucket bucket) {

    public static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    public static final int MAX_DAY_COUNT = 365;

    public static AnalyticsRange resolve(LocalDate from, LocalDate to, String rawBucket) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from and to are required");
        }
        if (from.isAfter(to)) {
            throw new IllegalArgumentException("from must be before or equal to to");
        }

        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        if (to.isAfter(today)) {
            throw new IllegalArgumentException("Analytics range cannot include a future date");
        }

        long dayCount = ChronoUnit.DAYS.between(from, to) + 1;
        if (dayCount > MAX_DAY_COUNT) {
            throw new IllegalArgumentException("Analytics range cannot exceed 365 days");
        }

        return new AnalyticsRange(from, to, AnalyticsBucket.resolve(rawBucket, dayCount));
    }

    public AnalyticsRange previous() {
        long dayCount = dayCount();
        return new AnalyticsRange(from.minusDays(dayCount), to.minusDays(dayCount), bucket);
    }

    public long dayCount() {
        return ChronoUnit.DAYS.between(from, to) + 1;
    }

    public LocalDateTime fromDateTime() {
        return from.atStartOfDay();
    }

    public LocalDateTime toExclusiveDateTime() {
        return to.plusDays(1).atStartOfDay();
    }
}
