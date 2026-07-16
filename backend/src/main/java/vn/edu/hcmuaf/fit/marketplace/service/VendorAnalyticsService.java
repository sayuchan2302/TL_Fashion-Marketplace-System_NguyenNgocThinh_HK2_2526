package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorAnalyticsResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorAnalyticsResponse.DailySeriesData;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorAnalyticsResponse.PeriodData;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository.DailySeriesProjection;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository.PeriodSummaryProjection;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class VendorAnalyticsService {

    private final OrderRepository orderRepository;
    private final StoreRepository storeRepository;
    private final PlatformCommissionSettingsService platformCommissionSettingsService;
    private final AnalyticsAggregationService analyticsAggregationService;

    @Autowired
    public VendorAnalyticsService(
            OrderRepository orderRepository,
            StoreRepository storeRepository,
            PlatformCommissionSettingsService platformCommissionSettingsService,
            AnalyticsAggregationService analyticsAggregationService
    ) {
        this.orderRepository = orderRepository;
        this.storeRepository = storeRepository;
        this.platformCommissionSettingsService = platformCommissionSettingsService;
        this.analyticsAggregationService = analyticsAggregationService;
    }

    public VendorAnalyticsService(
            OrderRepository orderRepository,
            StoreRepository storeRepository,
            PlatformCommissionSettingsService platformCommissionSettingsService
    ) {
        this(orderRepository, storeRepository, platformCommissionSettingsService, new AnalyticsAggregationService());
    }

    public VendorAnalyticsService(OrderRepository orderRepository, StoreRepository storeRepository) {
        this(orderRepository, storeRepository, null);
    }

    @Transactional(readOnly = true)
    public VendorAnalyticsResponse getAnalytics(UUID storeId) {
        LocalDate today = LocalDate.now();
        LocalDateTime todayStart = today.atStartOfDay();
        LocalDateTime weekStart = today.minusDays(6).atStartOfDay();
        LocalDateTime monthStart = today.minusDays(29).atStartOfDay();
        LocalDateTime yearStart = today.minusDays(364).atStartOfDay();
        LocalDateTime tomorrowStart = today.plusDays(1).atStartOfDay();

        PeriodData todayData = buildPeriodData(storeId, todayStart, tomorrowStart);
        PeriodData weekData = buildPeriodData(storeId, weekStart, tomorrowStart);
        PeriodData monthData = buildPeriodData(storeId, monthStart, tomorrowStart);
        PeriodData yearData = buildPeriodData(storeId, yearStart, tomorrowStart);

        List<DailySeriesProjection> dailyRows = orderRepository.findDailySeriesByStoreBetween(
                storeId, yearStart, tomorrowStart);

        Map<LocalDate, DailySeriesProjection> dailyMap = dailyRows.stream()
                .collect(Collectors.toMap(
                        row -> LocalDate.parse(row.getDate()),
                        row -> row
                ));

        List<DailySeriesData> dailyData = new ArrayList<>();
        for (LocalDate date = yearStart.toLocalDate(); !date.isAfter(today); date = date.plusDays(1)) {
            DailySeriesProjection row = dailyMap.get(date);
            dailyData.add(DailySeriesData.builder()
                    .date(date.toString())
                    .revenue(row != null ? row.getRevenue() : BigDecimal.ZERO)
                    .payout(row != null ? row.getPayout() : BigDecimal.ZERO)
                    .commission(row != null ? row.getCommission() : BigDecimal.ZERO)
                    .orders(row != null ? row.getOrderCount() : 0L)
                    .build());
        }

        BigDecimal currentCommissionRate = storeRepository.findById(storeId)
                .map(this::resolveEffectiveCommissionRate)
                .orElse(PlatformCommissionSettingsService.DEFAULT_COMMISSION_RATE_PERCENT);

        return VendorAnalyticsResponse.builder()
                .today(todayData)
                .week(weekData)
                .month(monthData)
                .year(yearData)
                .dailyData(dailyData)
                .commissionRate(currentCommissionRate)
                .build();
    }

    @Transactional(readOnly = true)
    public VendorAnalyticsResponse getAnalytics(UUID storeId, AnalyticsRange range) {
        AnalyticsRange previousRange = range.previous();
        List<AnalyticsDailyValue> currentRows = toAnalyticsRows(orderRepository.findDailySeriesByStoreBetween(
                storeId,
                range.fromDateTime(),
                range.toExclusiveDateTime()));
        List<AnalyticsDailyValue> previousRows = toAnalyticsRows(orderRepository.findDailySeriesByStoreBetween(
                storeId,
                previousRange.fromDateTime(),
                previousRange.toExclusiveDateTime()));
        BigDecimal currentCommissionRate = storeRepository.findById(storeId)
                .map(this::resolveEffectiveCommissionRate)
                .orElse(PlatformCommissionSettingsService.DEFAULT_COMMISSION_RATE_PERCENT);

        return VendorAnalyticsResponse.builder()
                .commissionRate(currentCommissionRate)
                .analytics(analyticsAggregationService.aggregate(
                        range,
                        currentRows,
                        orderRepository.countDistinctCustomersByStoreBetween(
                                storeId,
                                range.fromDateTime(),
                                range.toExclusiveDateTime()),
                        previousRows,
                        orderRepository.countDistinctCustomersByStoreBetween(
                                storeId,
                                previousRange.fromDateTime(),
                                previousRange.toExclusiveDateTime())))
                .build();
    }

    private List<AnalyticsDailyValue> toAnalyticsRows(List<DailySeriesProjection> rows) {
        return rows.stream()
                .map(row -> new AnalyticsDailyValue(
                        LocalDate.parse(row.getDate()),
                        safeAmount(row.getRevenue()),
                        safeAmount(row.getPayout()),
                        safeAmount(row.getCommission()),
                        row.getOrderCount() == null ? 0L : row.getOrderCount()))
                .toList();
    }

    private BigDecimal safeAmount(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private BigDecimal resolveEffectiveCommissionRate(Store store) {
        if (platformCommissionSettingsService != null) {
            return platformCommissionSettingsService.resolveEffectiveCommissionRate(store);
        }
        BigDecimal rate = store.getCommissionRate();
        if (rate == null || rate.compareTo(BigDecimal.ZERO) <= 0) {
            return PlatformCommissionSettingsService.DEFAULT_COMMISSION_RATE_PERCENT;
        }
        return rate;
    }

    private PeriodData buildPeriodData(UUID storeId, LocalDateTime from, LocalDateTime to) {
        List<PeriodSummaryProjection> summaries = orderRepository.findPeriodSummaryByStoreBetween(storeId, from, to);
        PeriodSummaryProjection current = summaries.isEmpty() ? null : summaries.get(0);

        long durationDays = java.time.Duration.between(from, to).toDays();
        LocalDateTime prevFrom = from.minusDays(durationDays);
        LocalDateTime prevTo = to.minusDays(durationDays);

        List<PeriodSummaryProjection> prevSummaries = orderRepository.findPeriodSummaryByStoreBetween(storeId, prevFrom, prevTo);
        PeriodSummaryProjection previous = prevSummaries.isEmpty() ? null : prevSummaries.get(0);

        long distinctCustomers = orderRepository.countDistinctCustomersByStoreBetween(storeId, from, to);
        double conversionRate = distinctCustomers > 0 && current != null && current.getOrderCount() != null
                ? (double) current.getOrderCount() / distinctCustomers
                : 0.0;

        return PeriodData.builder()
                .revenue(current != null ? current.getTotalRevenue() : BigDecimal.ZERO)
                .payout(current != null ? current.getTotalPayout() : BigDecimal.ZERO)
                .commission(current != null ? current.getTotalCommission() : BigDecimal.ZERO)
                .orders(current != null ? current.getOrderCount() : 0L)
                .avgOrderValue(current != null ? current.getAvgOrderValue() : BigDecimal.ZERO)
                .conversionRate(conversionRate)
                .previousRevenue(previous != null ? previous.getTotalRevenue() : BigDecimal.ZERO)
                .previousPayout(previous != null ? previous.getTotalPayout() : BigDecimal.ZERO)
                .previousCommission(previous != null ? previous.getTotalCommission() : BigDecimal.ZERO)
                .previousOrders(previous != null ? previous.getOrderCount() : 0L)
                .build();
    }
}
