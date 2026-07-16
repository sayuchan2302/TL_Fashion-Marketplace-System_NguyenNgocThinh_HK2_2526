package vn.edu.hcmuaf.fit.marketplace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnalyticsRangeResponse {
    private LocalDate from;
    private LocalDate to;
    private String bucket;
    private Summary summary;
    private Summary previous;
    private Changes changes;
    private List<SeriesPoint> series;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Summary {
        private BigDecimal grossRevenue;
        private BigDecimal payout;
        private BigDecimal commission;
        private BigDecimal netRevenue;
        private long deliveredOrders;
        private BigDecimal averageOrderValue;
        private long distinctCustomers;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Changes {
        private MetricChange grossRevenue;
        private MetricChange payout;
        private MetricChange commission;
        private MetricChange netRevenue;
        private MetricChange deliveredOrders;
        private MetricChange averageOrderValue;
        private MetricChange distinctCustomers;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MetricChange {
        private BigDecimal absolute;
        private Double percent;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SeriesPoint {
        private String label;
        private LocalDate from;
        private LocalDate to;
        private BigDecimal grossRevenue;
        private BigDecimal payout;
        private BigDecimal commission;
        private BigDecimal netRevenue;
        private long deliveredOrders;
    }
}
