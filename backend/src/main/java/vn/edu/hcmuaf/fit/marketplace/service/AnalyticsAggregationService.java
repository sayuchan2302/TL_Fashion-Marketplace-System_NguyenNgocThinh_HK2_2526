package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.stereotype.Service;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AnalyticsRangeResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AnalyticsRangeResponse.Changes;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AnalyticsRangeResponse.MetricChange;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AnalyticsRangeResponse.SeriesPoint;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AnalyticsRangeResponse.Summary;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AnalyticsAggregationService {

    private static final BigDecimal ZERO = BigDecimal.ZERO;
    private static final DateTimeFormatter DAY_LABEL = DateTimeFormatter.ofPattern("dd/MM");
    private static final DateTimeFormatter MONTH_LABEL = DateTimeFormatter.ofPattern("MM/yyyy");

    public AnalyticsRangeResponse aggregate(
            AnalyticsRange range,
            List<AnalyticsDailyValue> currentRows,
            long currentCustomers,
            List<AnalyticsDailyValue> previousRows,
            long previousCustomers) {
        Summary current = summarize(currentRows, currentCustomers);
        Summary previous = summarize(previousRows, previousCustomers);

        return AnalyticsRangeResponse.builder()
                .from(range.from())
                .to(range.to())
                .bucket(range.bucket().name())
                .summary(current)
                .previous(previous)
                .changes(buildChanges(current, previous))
                .series(buildSeries(range, currentRows))
                .build();
    }

    private Summary summarize(List<AnalyticsDailyValue> rows, long distinctCustomers) {
        BigDecimal grossRevenue = rows.stream()
                .map(AnalyticsDailyValue::grossRevenue)
                .map(this::safeAmount)
                .reduce(ZERO, BigDecimal::add);
        BigDecimal payout = rows.stream()
                .map(AnalyticsDailyValue::payout)
                .map(this::safeAmount)
                .reduce(ZERO, BigDecimal::add);
        BigDecimal commission = rows.stream()
                .map(AnalyticsDailyValue::commission)
                .map(this::safeAmount)
                .reduce(ZERO, BigDecimal::add);
        long orders = rows.stream().mapToLong(AnalyticsDailyValue::orders).sum();
        BigDecimal averageOrderValue = orders == 0
                ? ZERO
                : grossRevenue.divide(BigDecimal.valueOf(orders), 2, RoundingMode.HALF_UP);

        return Summary.builder()
                .grossRevenue(grossRevenue)
                .payout(payout)
                .commission(commission)
                .netRevenue(grossRevenue.subtract(commission).max(ZERO))
                .deliveredOrders(orders)
                .averageOrderValue(averageOrderValue)
                .distinctCustomers(Math.max(distinctCustomers, 0))
                .build();
    }

    private Changes buildChanges(Summary current, Summary previous) {
        return Changes.builder()
                .grossRevenue(change(current.getGrossRevenue(), previous.getGrossRevenue()))
                .payout(change(current.getPayout(), previous.getPayout()))
                .commission(change(current.getCommission(), previous.getCommission()))
                .netRevenue(change(current.getNetRevenue(), previous.getNetRevenue()))
                .deliveredOrders(change(current.getDeliveredOrders(), previous.getDeliveredOrders()))
                .averageOrderValue(change(current.getAverageOrderValue(), previous.getAverageOrderValue()))
                .distinctCustomers(change(current.getDistinctCustomers(), previous.getDistinctCustomers()))
                .build();
    }

    private MetricChange change(long current, long previous) {
        return change(BigDecimal.valueOf(current), BigDecimal.valueOf(previous));
    }

    private MetricChange change(BigDecimal current, BigDecimal previous) {
        BigDecimal absolute = current.subtract(previous);
        Double percent = previous.signum() == 0
                ? null
                : absolute.divide(previous, 6, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                        .doubleValue();
        return MetricChange.builder().absolute(absolute).percent(percent).build();
    }

    private List<SeriesPoint> buildSeries(AnalyticsRange range, List<AnalyticsDailyValue> rows) {
        Map<LocalDate, MutableSeriesPoint> buckets = new HashMap<>();
        for (AnalyticsDailyValue row : rows) {
            LocalDate bucketStart = bucketStart(row.date(), range.bucket());
            MutableSeriesPoint point = buckets.computeIfAbsent(bucketStart, ignored -> new MutableSeriesPoint());
            point.add(row);
        }

        List<SeriesPoint> result = new ArrayList<>();
        LocalDate cursor = bucketStart(range.from(), range.bucket());
        LocalDate lastBucket = bucketStart(range.to(), range.bucket());

        while (!cursor.isAfter(lastBucket)) {
            LocalDate bucketEnd = bucketEnd(cursor, range.bucket());
            MutableSeriesPoint point = buckets.getOrDefault(cursor, new MutableSeriesPoint());
            LocalDate visibleFrom = cursor.isBefore(range.from()) ? range.from() : cursor;
            LocalDate visibleTo = bucketEnd.isAfter(range.to()) ? range.to() : bucketEnd;

            result.add(SeriesPoint.builder()
                    .label(buildLabel(cursor, bucketEnd, range.bucket()))
                    .from(visibleFrom)
                    .to(visibleTo)
                    .grossRevenue(point.grossRevenue)
                    .payout(point.payout)
                    .commission(point.commission)
                    .netRevenue(point.grossRevenue.subtract(point.commission).max(ZERO))
                    .deliveredOrders(point.orders)
                    .build());

            cursor = nextBucket(cursor, range.bucket());
        }

        return result;
    }

    private LocalDate bucketStart(LocalDate date, AnalyticsBucket bucket) {
        return switch (bucket) {
            case DAY -> date;
            case WEEK -> date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            case MONTH -> date.withDayOfMonth(1);
        };
    }

    private LocalDate bucketEnd(LocalDate start, AnalyticsBucket bucket) {
        return switch (bucket) {
            case DAY -> start;
            case WEEK -> start.plusDays(6);
            case MONTH -> start.with(TemporalAdjusters.lastDayOfMonth());
        };
    }

    private LocalDate nextBucket(LocalDate start, AnalyticsBucket bucket) {
        return switch (bucket) {
            case DAY -> start.plusDays(1);
            case WEEK -> start.plusWeeks(1);
            case MONTH -> start.plusMonths(1);
        };
    }

    private String buildLabel(LocalDate start, LocalDate end, AnalyticsBucket bucket) {
        return switch (bucket) {
            case DAY -> DAY_LABEL.format(start);
            case WEEK -> "Tuần " + DAY_LABEL.format(start) + " - " + DAY_LABEL.format(end);
            case MONTH -> MONTH_LABEL.format(start);
        };
    }

    private BigDecimal safeAmount(BigDecimal amount) {
        return amount == null ? ZERO : amount;
    }

    private static final class MutableSeriesPoint {
        private BigDecimal grossRevenue = ZERO;
        private BigDecimal payout = ZERO;
        private BigDecimal commission = ZERO;
        private long orders;

        private void add(AnalyticsDailyValue row) {
            grossRevenue = grossRevenue.add(row.grossRevenue() == null ? ZERO : row.grossRevenue());
            payout = payout.add(row.payout() == null ? ZERO : row.payout());
            commission = commission.add(row.commission() == null ? ZERO : row.commission());
            orders += row.orders();
        }
    }
}
