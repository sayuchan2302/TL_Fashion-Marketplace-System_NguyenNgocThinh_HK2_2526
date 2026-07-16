package vn.edu.hcmuaf.fit.marketplace.service;

import org.junit.jupiter.api.Test;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AnalyticsRangeResponse;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AnalyticsAggregationServiceTest {

    private final AnalyticsAggregationService service = new AnalyticsAggregationService();

    @Test
    void aggregatesCurrentAndPreviousPeriodsAndFillsEmptyDailyBuckets() {
        LocalDate end = LocalDate.now(AnalyticsRange.BUSINESS_ZONE).minusDays(1);
        LocalDate start = end.minusDays(2);
        AnalyticsRange range = new AnalyticsRange(
                start,
                end,
                AnalyticsBucket.DAY);

        AnalyticsRangeResponse response = service.aggregate(
                range,
                List.of(new AnalyticsDailyValue(
                        start,
                        new BigDecimal("100000"),
                        new BigDecimal("80000"),
                        new BigDecimal("20000"),
                        2L)),
                2L,
                List.of(new AnalyticsDailyValue(
                        start.minusDays(3),
                        new BigDecimal("50000"),
                        new BigDecimal("40000"),
                        new BigDecimal("10000"),
                        1L)),
                0L);

        assertEquals(new BigDecimal("100000"), response.getSummary().getGrossRevenue());
        assertEquals(2L, response.getSummary().getDeliveredOrders());
        assertEquals(2L, response.getSummary().getDistinctCustomers());
        assertEquals(new BigDecimal("50000"), response.getPrevious().getGrossRevenue());
        assertEquals(100.0, response.getChanges().getGrossRevenue().getPercent());
        assertNull(response.getChanges().getDistinctCustomers().getPercent());
        assertEquals(3, response.getSeries().size());
        assertEquals(new BigDecimal("0"), response.getSeries().get(1).getGrossRevenue());
    }

    @Test
    void resolvesBucketFromRangeLengthAndRejectsInvalidRanges() {
        assertEquals(AnalyticsBucket.DAY, AnalyticsBucket.resolve("AUTO", 31));
        assertEquals(AnalyticsBucket.WEEK, AnalyticsBucket.resolve("AUTO", 32));
        assertEquals(AnalyticsBucket.MONTH, AnalyticsBucket.resolve("AUTO", 181));
        LocalDate today = LocalDate.now(AnalyticsRange.BUSINESS_ZONE);
        assertThrows(IllegalArgumentException.class, () -> AnalyticsRange.resolve(
                today.minusDays(365),
                today,
                "AUTO"));
    }
}
