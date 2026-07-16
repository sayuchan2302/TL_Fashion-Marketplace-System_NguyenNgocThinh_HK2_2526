package vn.edu.hcmuaf.fit.marketplace.service;

import java.util.Locale;

public enum AnalyticsBucket {
    DAY,
    WEEK,
    MONTH;

    public static AnalyticsBucket resolve(String raw, long dayCount) {
        if (raw == null || raw.isBlank() || "AUTO".equalsIgnoreCase(raw.trim())) {
            if (dayCount <= 31) return DAY;
            if (dayCount <= 180) return WEEK;
            return MONTH;
        }

        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("bucket must be DAY, WEEK, or MONTH");
        }
    }
}
