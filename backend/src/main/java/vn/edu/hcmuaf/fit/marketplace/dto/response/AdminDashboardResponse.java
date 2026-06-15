package vn.edu.hcmuaf.fit.marketplace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminDashboardResponse {
    private Metrics metrics;
    private QuickViews quickViews;
    private List<TrendPoint> trend;
    private List<ParentOrderQueueItem> parentOrders;
    private List<TopCategorySignal> topCategories;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Metrics {
        private BigDecimal gmvDelivered;
        private BigDecimal commissionDelivered;
        private long totalOrders;
        private long pendingStoreApprovals;
        private long lockedUsers;
        private long totalCustomers;
        private long runningCampaigns;
        private long totalStores;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuickViews {
        private long pendingStoreApprovals;
        private long categoriesNeedReview;
        private long parentOrdersNeedAttention;
        private long pendingReturns;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TrendPoint {
        private LocalDate date;
        private BigDecimal gmv;
        private BigDecimal commission;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ParentOrderQueueItem {
        private UUID id;
        private String code;
        private String customerName;
        private BigDecimal total;
        private String issue;
        private String priority;
        private long waitMinutes;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TopCategorySignal {
        private UUID categoryId;
        private String name;
        private String image;
        private long productCount;
        private String signal;
    }
}
