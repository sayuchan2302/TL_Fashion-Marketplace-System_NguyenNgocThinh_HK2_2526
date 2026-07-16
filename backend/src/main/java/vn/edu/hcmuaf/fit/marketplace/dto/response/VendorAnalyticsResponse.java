package vn.edu.hcmuaf.fit.marketplace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VendorAnalyticsResponse {

    private PeriodData today;
    private PeriodData week;
    private PeriodData month;
    private PeriodData year;
    private List<DailySeriesData> dailyData;
    private BigDecimal commissionRate;
    private AnalyticsRangeResponse analytics;

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PeriodData {
        private BigDecimal revenue;
        private BigDecimal payout;
        private BigDecimal commission;
        private Long orders;
        private BigDecimal avgOrderValue;
        private Double conversionRate;
        private BigDecimal previousRevenue;
        private BigDecimal previousPayout;
        private BigDecimal previousCommission;
        private Long previousOrders;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DailySeriesData {
        private String date;
        private BigDecimal revenue;
        private BigDecimal payout;
        private BigDecimal commission;
        private Long orders;
    }
}
