package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AdminDashboardResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AnalyticsRangeResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Category;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.entity.Voucher;
import vn.edu.hcmuaf.fit.marketplace.repository.CategoryRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReturnRequestRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.VoucherRepository;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AdminDashboardService {

    private static final int PARENT_QUEUE_LIMIT = 5;
    private static final int TOP_CATEGORY_LIMIT = 3;

    private final OrderRepository orderRepository;
    private final StoreRepository storeRepository;
    private final UserRepository userRepository;
    private final VoucherRepository voucherRepository;
    private final ReturnRequestRepository returnRequestRepository;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final AnalyticsAggregationService analyticsAggregationService;

    public AdminDashboardService(
            OrderRepository orderRepository,
            StoreRepository storeRepository,
            UserRepository userRepository,
            VoucherRepository voucherRepository,
            ReturnRequestRepository returnRequestRepository,
            CategoryRepository categoryRepository,
            ProductRepository productRepository) {
        this(
                orderRepository,
                storeRepository,
                userRepository,
                voucherRepository,
                returnRequestRepository,
                categoryRepository,
                productRepository,
                new AnalyticsAggregationService());
    }

    @Autowired
    public AdminDashboardService(
            OrderRepository orderRepository,
            StoreRepository storeRepository,
            UserRepository userRepository,
            VoucherRepository voucherRepository,
            ReturnRequestRepository returnRequestRepository,
            CategoryRepository categoryRepository,
            ProductRepository productRepository,
            AnalyticsAggregationService analyticsAggregationService) {
        this.orderRepository = orderRepository;
        this.storeRepository = storeRepository;
        this.userRepository = userRepository;
        this.voucherRepository = voucherRepository;
        this.returnRequestRepository = returnRequestRepository;
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.analyticsAggregationService = analyticsAggregationService;
    }

    @Transactional(readOnly = true)
    public AdminDashboardResponse getDashboard() {
        long pendingStores = storeRepository.countByApprovalStatus(Store.ApprovalStatus.PENDING);
        long lockedUsers = userRepository.countByIsActiveFalse();
        long totalCustomers = userRepository.countByRole(User.Role.CUSTOMER);
        long runningCampaigns = voucherRepository.countByStatus(Voucher.VoucherStatus.RUNNING);
        long pendingReturns = returnRequestRepository.countByStatus(ReturnRequest.ReturnStatus.DISPUTING);
        long categoriesNeedReview = categoryRepository.countByIsVisibleFalse();
        long parentOrdersNeedAttention = countParentOrdersNeedAttention();

        return AdminDashboardResponse.builder()
                .metrics(AdminDashboardResponse.Metrics.builder()
                        .gmvDelivered(safeAmount(orderRepository.calculateTotalDeliveredGmv()))
                        .commissionDelivered(safeAmount(orderRepository.calculateTotalDeliveredCommission()))
                        .totalOrders(orderRepository.countByParentOrderIsNull())
                        .pendingStoreApprovals(pendingStores)
                        .lockedUsers(lockedUsers)
                        .totalCustomers(totalCustomers)
                        .runningCampaigns(runningCampaigns)
                        .totalStores(storeRepository.count())
                        .build())
                .quickViews(AdminDashboardResponse.QuickViews.builder()
                        .pendingStoreApprovals(pendingStores)
                        .categoriesNeedReview(categoriesNeedReview)
                        .parentOrdersNeedAttention(parentOrdersNeedAttention)
                        .pendingReturns(pendingReturns)
                        .build())
                .trend(buildTrend())
                .parentOrders(buildParentOrderQueue())
                .topCategories(buildTopCategories())
                .build();
    }

    @Transactional(readOnly = true)
    public AdminDashboardResponse getDashboard(AnalyticsRange range) {
        AdminDashboardResponse response = getDashboard();
        response.setAnalytics(buildRangeAnalytics(range));
        return response;
    }

    private AnalyticsRangeResponse buildRangeAnalytics(AnalyticsRange range) {
        AnalyticsRange previousRange = range.previous();
        List<AnalyticsDailyValue> currentRows = orderRepository
                .findPlatformDeliveredDailyRevenueBetween(range.fromDateTime(), range.toExclusiveDateTime())
                .stream()
                .map(row -> new AnalyticsDailyValue(
                        LocalDate.parse(row.getDate()),
                        safeAmount(row.getGmv()),
                        BigDecimal.ZERO,
                        safeAmount(row.getCommission()),
                        row.getOrderCount() == null ? 0L : row.getOrderCount()))
                .toList();
        List<AnalyticsDailyValue> previousRows = orderRepository
                .findPlatformDeliveredDailyRevenueBetween(previousRange.fromDateTime(), previousRange.toExclusiveDateTime())
                .stream()
                .map(row -> new AnalyticsDailyValue(
                        LocalDate.parse(row.getDate()),
                        safeAmount(row.getGmv()),
                        BigDecimal.ZERO,
                        safeAmount(row.getCommission()),
                        row.getOrderCount() == null ? 0L : row.getOrderCount()))
                .toList();

        return analyticsAggregationService.aggregate(
                range,
                currentRows,
                orderRepository.countDistinctPlatformCustomersBetween(
                        range.fromDateTime(),
                        range.toExclusiveDateTime()),
                previousRows,
                orderRepository.countDistinctPlatformCustomersBetween(
                        previousRange.fromDateTime(),
                        previousRange.toExclusiveDateTime()));
    }

    private List<AdminDashboardResponse.TrendPoint> buildTrend() {
        return orderRepository.findPlatformDeliveredDailyRevenue()
                .stream()
                .map(row -> AdminDashboardResponse.TrendPoint.builder()
                        .date(LocalDate.parse(row.getDate()))
                        .gmv(safeAmount(row.getGmv()))
                        .commission(safeAmount(row.getCommission()))
                        .build())
                .toList();
    }

    private List<AdminDashboardResponse.ParentOrderQueueItem> buildParentOrderQueue() {
        LocalDateTime now = LocalDateTime.now();
        List<Order.OrderStatus> queueStatuses = List.of(
                Order.OrderStatus.PENDING,
                Order.OrderStatus.CONFIRMED,
                Order.OrderStatus.PROCESSING);

        return orderRepository
                .findParentOrdersByStatusInOrderByCreatedAtAsc(queueStatuses, PageRequest.of(0, PARENT_QUEUE_LIMIT))
                .stream()
                .map(order -> {
                    long waitMinutes = order.getCreatedAt() == null
                            ? 0L
                            : Math.max(0L, Duration.between(order.getCreatedAt(), now).toMinutes());

                    return AdminDashboardResponse.ParentOrderQueueItem.builder()
                            .id(order.getId())
                            .code(order.getOrderCode())
                            .customerName(order.getUser() != null ? order.getUser().getName() : "Khách hàng")
                            .total(safeAmount(order.getTotal()))
                            .issue(resolveIssue(order.getStatus()))
                            .priority(resolvePriority(waitMinutes))
                            .waitMinutes(waitMinutes)
                            .build();
                })
                .toList();
    }

    private List<AdminDashboardResponse.TopCategorySignal> buildTopCategories() {
        List<Object[]> rows = productRepository.countActiveProductsByCategory(PageRequest.of(0, TOP_CATEGORY_LIMIT));
        if (rows.isEmpty()) {
            return List.of();
        }

        List<UUID> categoryIds = rows.stream()
                .map(row -> (UUID) row[0])
                .toList();

        Map<UUID, Category> categoryById = categoryRepository.findAllById(categoryIds)
                .stream()
                .collect(Collectors.toMap(Category::getId, category -> category));

        List<AdminDashboardResponse.TopCategorySignal> result = new ArrayList<>();
        for (int index = 0; index < rows.size(); index++) {
            UUID categoryId = (UUID) rows.get(index)[0];
            long productCount = ((Number) rows.get(index)[1]).longValue();
            Category category = categoryById.get(categoryId);

            result.add(AdminDashboardResponse.TopCategorySignal.builder()
                    .categoryId(categoryId)
                    .name(category != null ? category.getName() : "Danh mục")
                    .image(category != null ? category.getImage() : null)
                    .productCount(productCount)
                    .signal(resolveCategorySignal(index))
                    .build());
        }

        return result;
    }

    private long countParentOrdersNeedAttention() {
        return orderRepository.countByParentOrderIsNullAndStatus(Order.OrderStatus.PENDING)
                + orderRepository.countByParentOrderIsNullAndStatus(Order.OrderStatus.CONFIRMED)
                + orderRepository.countByParentOrderIsNullAndStatus(Order.OrderStatus.PROCESSING);
    }

    private String resolveIssue(Order.OrderStatus status) {
        if (status == Order.OrderStatus.PENDING) {
            return "Chờ xác nhận vận hành";
        }
        if (status == Order.OrderStatus.CONFIRMED) {
            return "Đã xác nhận, chờ xử lý kho";
        }
        if (status == Order.OrderStatus.PROCESSING) {
            return "Chờ đóng gói và cập nhật vận đơn";
        }
        return "Theo dõi vận hành";
    }

    private String resolvePriority(long waitMinutes) {
        if (waitMinutes >= 180) {
            return "high";
        }
        if (waitMinutes >= 60) {
            return "medium";
        }
        return "low";
    }

    private String resolveCategorySignal(int rankIndex) {
        if (rankIndex == 0) {
            return "Top độ phủ sản phẩm";
        }
        if (rankIndex == 1) {
            return "Theo dõi chuyển đổi";
        }
        return "Theo dõi biên lợi nhuận";
    }

    private BigDecimal safeAmount(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
