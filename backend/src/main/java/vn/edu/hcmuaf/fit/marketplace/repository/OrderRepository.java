package vn.edu.hcmuaf.fit.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import java.math.BigDecimal;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface OrderRepository extends JpaRepository<Order, UUID> {
        interface UserSpendingProjection {
                UUID getUserId();

                BigDecimal getTotalSpent();
        }

        interface ProductSalesProjection {
                UUID getProductId();

                String getProductName();

                String getProductImage();

                Long getSoldCount();

                BigDecimal getGrossRevenue();
        }

        interface EligibleReviewItemProjection {
                UUID getOrderId();

                UUID getProductId();

                String getProductSlug();

                String getProductName();

                String getProductImage();

                String getVariantName();

                Integer getQuantity();

                LocalDateTime getDeliveredAt();
        }

        List<Order> findByUserIdOrderByCreatedAtDesc(UUID userId);

        List<Order> findByUserIdAndParentOrderIsNullOrderByCreatedAtDesc(UUID userId);

        @Query("""
                        SELECT o.user.id AS userId, COALESCE(SUM(o.total), 0) AS totalSpent
                        FROM Order o
                        WHERE o.parentOrder IS NULL
                          AND o.user.id IN :userIds
                          AND o.status = 'DELIVERED'
                        GROUP BY o.user.id
                        """)
        List<UserSpendingProjection> calculateDeliveredSpendingByUserIds(@Param("userIds") List<UUID> userIds);

        List<Order> findByParentOrderIsNullOrderByCreatedAtDesc();

        Page<Order> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

        @Query("SELECT o FROM Order o LEFT JOIN FETCH o.items WHERE o.id = :id")
        Optional<Order> findByIdWithItems(UUID id);

        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT o FROM Order o WHERE o.id = :id")
        Optional<Order> findByIdForUpdate(@Param("id") UUID id);

        Optional<Order> findByUserIdAndId(UUID userId, UUID id);

        Optional<Order> findByOrderCode(String orderCode);

        Optional<Order> findByOrderCodeAndStoreId(String orderCode, UUID storeId);

        Optional<Order> findTopByOrderCodeStartingWithOrderByOrderCodeDesc(String orderCodePrefix);

        List<Order> findByOrderCodeIsNullOrderByCreatedAtAscIdAsc();

        // ─── Multi-vendor: Store-scoped queries ────────────────────────────────────

        /**
         * Find all orders for a specific store (vendor)
         */
        Page<Order> findByStoreIdOrderByCreatedAtDesc(UUID storeId, Pageable pageable);

        /**
         * Find orders by store with status filter
         */
        Page<Order> findByStoreIdAndStatusOrderByCreatedAtDesc(UUID storeId, Order.OrderStatus status,
                        Pageable pageable);

        @Query("""
                        SELECT o FROM Order o
                        LEFT JOIN o.user u
                        LEFT JOIN o.shippingAddress a
                        WHERE o.storeId = :storeId
                          AND (:status IS NULL OR o.status = :status)
                          AND (
                                COALESCE(:keyword, '') = ''
                                OR LOWER(STR(o.id)) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                                OR LOWER(COALESCE(o.orderCode, '')) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                                OR LOWER(COALESCE(u.name, '')) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                                OR LOWER(COALESCE(u.email, '')) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                                OR LOWER(COALESCE(a.fullName, '')) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                              )
                          AND o.createdAt >= :fromDate
                          AND o.createdAt < :toDate
                        ORDER BY o.createdAt DESC
                        """)
        Page<Order> searchByStore(
                        @Param("storeId") UUID storeId,
                        @Param("status") Order.OrderStatus status,
                        @Param("keyword") String keyword,
                        @Param("fromDate") LocalDateTime fromDate,
                        @Param("toDate") LocalDateTime toDate,
                        Pageable pageable);

        @Query("""
                        SELECT o FROM Order o
                        LEFT JOIN o.user u
                        LEFT JOIN o.shippingAddress a
                        WHERE o.storeId = :storeId
                          AND o.status IN :statuses
                          AND (
                                COALESCE(:keyword, '') = ''
                                OR LOWER(STR(o.id)) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                                OR LOWER(COALESCE(o.orderCode, '')) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                                OR LOWER(COALESCE(u.name, '')) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                                OR LOWER(COALESCE(u.email, '')) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                                OR LOWER(COALESCE(a.fullName, '')) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                              )
                          AND o.createdAt >= :fromDate
                          AND o.createdAt < :toDate
                        ORDER BY o.createdAt DESC
                        """)
        Page<Order> searchByStoreStatuses(
                        @Param("storeId") UUID storeId,
                        @Param("statuses") List<Order.OrderStatus> statuses,
                        @Param("keyword") String keyword,
                        @Param("fromDate") LocalDateTime fromDate,
                        @Param("toDate") LocalDateTime toDate,
                        Pageable pageable);

        /**
         * Find order by ID only if it belongs to the specified store (ownership check)
         */
        Optional<Order> findByIdAndStoreId(UUID id, UUID storeId);

        /**
         * Find order by ID with items, scoped to store
         */
        @Query("SELECT o FROM Order o LEFT JOIN FETCH o.items WHERE o.id = :id AND o.storeId = :storeId")
        Optional<Order> findByIdWithItemsAndStoreId(@Param("id") UUID id, @Param("storeId") UUID storeId);

        /**
         * Find sub-orders for a parent order
         */
        List<Order> findByParentOrderOrderByCreatedAtDesc(Order parentOrder);

        List<Order> findByParentOrderIdOrderByCreatedAtDesc(UUID parentOrderId);

        @Query("""
                        SELECT DISTINCT o FROM Order o
                        LEFT JOIN FETCH o.items
                        WHERE o.parentOrder.id IN :parentOrderIds
                        ORDER BY o.createdAt DESC
                        """)
        List<Order> findByParentOrderIdInWithItemsOrderByCreatedAtDesc(
                        @Param("parentOrderIds") List<UUID> parentOrderIds);

        @Query("""
                        SELECT DISTINCT o FROM Order o
                        LEFT JOIN FETCH o.items
                        WHERE o.parentOrder.id = :parentOrderId
                        ORDER BY o.createdAt DESC
                        """)
        List<Order> findByParentOrderIdWithItemsOrderByCreatedAtDesc(@Param("parentOrderId") UUID parentOrderId);

        /**
         * Count orders by store (for vendor dashboard)
         */
        long countByStoreId(UUID storeId);

        /**
         * Count orders by store and status
         */
        long countByStoreIdAndStatus(UUID storeId, Order.OrderStatus status);

        /**
         * Calculate total revenue for a store
         */
        @Query("SELECT COALESCE(SUM(o.total), 0) FROM Order o WHERE o.storeId = :storeId AND o.status = 'DELIVERED'")
        BigDecimal calculateRevenueByStoreId(@Param("storeId") UUID storeId);

        /**
         * Calculate total vendor payout for a store
         */
        @Query("SELECT COALESCE(SUM(o.vendorPayout), 0) FROM Order o WHERE o.storeId = :storeId AND o.status = 'DELIVERED'")
        BigDecimal calculatePayoutByStoreId(@Param("storeId") UUID storeId);

        /**
         * Calculate total commission collected for a store
         */
        @Query("SELECT COALESCE(SUM(o.commissionFee), 0) FROM Order o WHERE o.storeId = :storeId AND o.status = 'DELIVERED'")
        BigDecimal calculateCommissionByStoreId(@Param("storeId") UUID storeId);

        long countByParentOrderIsNull();

        long countByParentOrderIsNullAndStatus(Order.OrderStatus status);

        @Query("""
                        SELECT COALESCE(SUM(o.total), 0) FROM Order o
                        WHERE o.parentOrder IS NULL
                          AND o.status = 'DELIVERED'
                        """)
        BigDecimal calculateTotalDeliveredGmv();

        @Query("""
                        SELECT COALESCE(SUM(o.commissionFee), 0) FROM Order o
                        WHERE o.parentOrder IS NULL
                          AND o.status = 'DELIVERED'
                        """)
        BigDecimal calculateTotalDeliveredCommission();

        @Query("""
                        SELECT o FROM Order o
                        WHERE o.parentOrder IS NULL
                          AND o.storeId IS NULL
                          AND o.status IN :statuses
                        ORDER BY o.createdAt ASC
                        """)
        List<Order> findParentOrdersByStatusInOrderByCreatedAtAsc(
                        @Param("statuses") List<Order.OrderStatus> statuses,
                        Pageable pageable);

        @Query("""
                        SELECT o FROM Order o
                        WHERE (o.storeId IS NOT NULL OR (o.parentOrder IS NULL AND o.subOrders IS EMPTY))
                          AND o.status = 'WAITING_FOR_VENDOR'
                          AND (
                                (o.vendorConfirmationDeadlineAt IS NOT NULL AND o.vendorConfirmationDeadlineAt <= :now)
                                OR (o.vendorConfirmationDeadlineAt IS NULL AND o.createdAt <= :legacyCutoff)
                              )
                        ORDER BY COALESCE(o.vendorConfirmationDeadlineAt, o.createdAt) ASC
                        """)
        List<Order> findVendorConfirmationDeadlineBreaches(
                        @Param("now") LocalDateTime now,
                        @Param("legacyCutoff") LocalDateTime legacyCutoff,
                        Pageable pageable);

        @Query("""
                        SELECT o FROM Order o
                        WHERE o.parentOrder IS NULL
                          AND o.status = 'DELIVERED'
                          AND COALESCE(o.deliveredAt, o.createdAt) >= :fromDate
                          AND COALESCE(o.deliveredAt, o.createdAt) < :toDate
                        """)
        List<Order> findRootDeliveredOrdersByDeliveredAtBetween(
                        @Param("fromDate") LocalDateTime fromDate,
                        @Param("toDate") LocalDateTime toDate);

        @Query("""
                        SELECT oi.product.id AS productId,
                               COALESCE(MAX(oi.productName), MAX(oi.product.name)) AS productName,
                               COALESCE(MAX(oi.productImage), '') AS productImage,
                               COALESCE(SUM(oi.quantity), 0) AS soldCount,
                               COALESCE(SUM(oi.totalPrice), 0) AS grossRevenue
                        FROM OrderItem oi
                        JOIN oi.order o
                        WHERE o.storeId = :storeId
                          AND o.status = 'DELIVERED'
                          AND COALESCE(o.deliveredAt, o.createdAt) >= :fromDate
                          AND COALESCE(o.deliveredAt, o.createdAt) < :toDate
                        GROUP BY oi.product.id
                        ORDER BY SUM(oi.quantity) DESC, SUM(oi.totalPrice) DESC
                        """)
        List<ProductSalesProjection> findTopDeliveredProductsByStoreBetween(
                        @Param("storeId") UUID storeId,
                        @Param("fromDate") LocalDateTime fromDate,
                        @Param("toDate") LocalDateTime toDate,
                        Pageable pageable);

        @Query("""
                        SELECT oi.product.id AS productId,
                               COALESCE(MAX(oi.productName), MAX(oi.product.name)) AS productName,
                               COALESCE(MAX(oi.productImage), '') AS productImage,
                               COALESCE(SUM(oi.quantity), 0) AS soldCount,
                               COALESCE(SUM(oi.totalPrice), 0) AS grossRevenue
                        FROM OrderItem oi
                        JOIN oi.order o
                        WHERE o.storeId = :storeId
                          AND o.status = 'DELIVERED'
                          AND oi.product.id IN :productIds
                        GROUP BY oi.product.id
                        """)
        List<ProductSalesProjection> findDeliveredProductSalesByStoreAndProductIds(
                        @Param("storeId") UUID storeId,
                        @Param("productIds") List<UUID> productIds);

        @Query("""
                        SELECT oi.product.id AS productId,
                               COALESCE(MAX(oi.productName), MAX(oi.product.name)) AS productName,
                               COALESCE(MAX(oi.productImage), '') AS productImage,
                               COALESCE(SUM(oi.quantity), 0) AS soldCount,
                               COALESCE(SUM(oi.totalPrice), 0) AS grossRevenue
                        FROM OrderItem oi
                        JOIN oi.order o
                        WHERE o.status = 'DELIVERED'
                          AND oi.product.id IN :productIds
                        GROUP BY oi.product.id
                        """)
        List<ProductSalesProjection> findDeliveredProductSalesByProductIds(
                        @Param("productIds") List<UUID> productIds);

        @Query("""
                        SELECT CASE WHEN COUNT(oi) > 0 THEN true ELSE false END
                        FROM OrderItem oi
                        JOIN oi.order o
                        WHERE o.id = :orderId
                          AND o.user.id = :userId
                          AND o.status = 'DELIVERED'
                          AND oi.product.id = :productId
                        """)
        boolean existsDeliveredOrderItemByUserAndOrderAndProduct(
                        @Param("userId") UUID userId,
                        @Param("orderId") UUID orderId,
                        @Param("productId") UUID productId);

        @Query("""
                        SELECT CASE WHEN COUNT(oi) > 0 THEN true ELSE false END
                        FROM OrderItem oi
                        JOIN oi.order o
                        WHERE o.user.id = :userId
                          AND o.status = 'DELIVERED'
                          AND oi.product.id = :productId
                        """)
        boolean existsDeliveredOrderItemByUserAndProduct(
                        @Param("userId") UUID userId,
                        @Param("productId") UUID productId);

        @Query("""
                        SELECT o
                        FROM Order o
                        JOIN o.items oi
                        WHERE o.user.id = :userId
                          AND o.status = 'DELIVERED'
                          AND oi.product.id = :productId
                        ORDER BY COALESCE(o.deliveredAt, o.createdAt) DESC
                        """)
        List<Order> findDeliveredOrdersByUserAndProduct(
                        @Param("userId") UUID userId,
                        @Param("productId") UUID productId,
                        Pageable pageable);

        @Query("""
                        SELECT o.id AS orderId,
                               oi.product.id AS productId,
                               COALESCE(oi.product.slug, '') AS productSlug,
                               COALESCE(oi.productName, oi.product.name) AS productName,
                               COALESCE(oi.productImage, '') AS productImage,
                               COALESCE(oi.variantName, '') AS variantName,
                               oi.quantity AS quantity,
                               COALESCE(o.deliveredAt, o.createdAt) AS deliveredAt
                        FROM OrderItem oi
                        JOIN oi.order o
                        WHERE o.user.id = :userId
                          AND o.status = 'DELIVERED'
                          AND NOT EXISTS (
                            SELECT 1
                            FROM Review r
                            WHERE r.user.id = :userId
                              AND r.order.id = o.id
                              AND r.product.id = oi.product.id
                          )
                        ORDER BY COALESCE(o.deliveredAt, o.createdAt) DESC, oi.createdAt DESC
                        """)
        List<EligibleReviewItemProjection> findEligibleReviewItemsByUserId(@Param("userId") UUID userId);

        // ─── Vendor Analytics ──────────────────────────────────────────────────────

        interface DailySeriesProjection {
                String getDate();

                BigDecimal getRevenue();

                Long getOrderCount();

                BigDecimal getPayout();

                BigDecimal getCommission();
        }

        interface PeriodSummaryProjection {
                BigDecimal getTotalRevenue();

                BigDecimal getTotalPayout();

                BigDecimal getTotalCommission();

                Long getOrderCount();

                BigDecimal getAvgOrderValue();
        }

        interface PlatformDailyRevenueProjection {
                String getDate();

                BigDecimal getGmv();

                BigDecimal getCommission();

                Long getOrderCount();
        }

        @Query("""
                        SELECT DATE(COALESCE(o.deliveredAt, o.createdAt)) AS date,
                               COALESCE(SUM(o.total), 0) AS gmv,
                               COALESCE(SUM(o.commissionFee), 0) AS commission,
                               COUNT(o.id) AS orderCount
                        FROM Order o
                        WHERE o.parentOrder IS NULL
                          AND o.status = 'DELIVERED'
                        GROUP BY DATE(COALESCE(o.deliveredAt, o.createdAt))
                        ORDER BY date ASC
                        """)
        List<PlatformDailyRevenueProjection> findPlatformDeliveredDailyRevenue();

        @Query("""
                        SELECT DATE(COALESCE(o.deliveredAt, o.createdAt)) AS date,
                               COALESCE(SUM(o.total), 0) AS gmv,
                               COALESCE(SUM(o.commissionFee), 0) AS commission,
                               COUNT(o.id) AS orderCount
                        FROM Order o
                        WHERE o.parentOrder IS NULL
                          AND o.status = 'DELIVERED'
                          AND COALESCE(o.deliveredAt, o.createdAt) >= :fromDate
                          AND COALESCE(o.deliveredAt, o.createdAt) < :toDate
                        GROUP BY DATE(COALESCE(o.deliveredAt, o.createdAt))
                        ORDER BY date ASC
                        """)
        List<PlatformDailyRevenueProjection> findPlatformDeliveredDailyRevenueBetween(
                        @Param("fromDate") LocalDateTime fromDate,
                        @Param("toDate") LocalDateTime toDate);

        @Query("""
                        SELECT COUNT(DISTINCT o.user.id)
                        FROM Order o
                        WHERE o.parentOrder IS NULL
                          AND o.status = 'DELIVERED'
                          AND COALESCE(o.deliveredAt, o.createdAt) >= :fromDate
                          AND COALESCE(o.deliveredAt, o.createdAt) < :toDate
                        """)
        long countDistinctPlatformCustomersBetween(
                        @Param("fromDate") LocalDateTime fromDate,
                        @Param("toDate") LocalDateTime toDate);

        @Query("""
                        SELECT DATE(COALESCE(o.deliveredAt, o.createdAt)) AS date,
                               COALESCE(SUM(o.total), 0) AS revenue,
                               COUNT(o.id) AS orderCount,
                               COALESCE(SUM(o.vendorPayout), 0) AS payout,
                               COALESCE(SUM(o.commissionFee), 0) AS commission
                        FROM Order o
                        WHERE o.storeId = :storeId
                          AND o.status = 'DELIVERED'
                          AND COALESCE(o.deliveredAt, o.createdAt) >= :fromDate
                          AND COALESCE(o.deliveredAt, o.createdAt) < :toDate
                        GROUP BY DATE(COALESCE(o.deliveredAt, o.createdAt))
                        ORDER BY date ASC
                        """)
        List<DailySeriesProjection> findDailySeriesByStoreBetween(
                        @Param("storeId") UUID storeId,
                        @Param("fromDate") LocalDateTime fromDate,
                        @Param("toDate") LocalDateTime toDate);

        @Query("""
                        SELECT COALESCE(SUM(o.total), 0) AS totalRevenue,
                               COALESCE(SUM(o.vendorPayout), 0) AS totalPayout,
                               COALESCE(SUM(o.commissionFee), 0) AS totalCommission,
                               COUNT(o.id) AS orderCount,
                               CASE WHEN COUNT(o.id) > 0
                                    THEN COALESCE(SUM(o.total), 0) / COUNT(o.id)
                                    ELSE 0 END AS avgOrderValue
                        FROM Order o
                        WHERE o.storeId = :storeId
                          AND o.status = 'DELIVERED'
                          AND COALESCE(o.deliveredAt, o.createdAt) >= :fromDate
                          AND COALESCE(o.deliveredAt, o.createdAt) < :toDate
                        """)
        List<PeriodSummaryProjection> findPeriodSummaryByStoreBetween(
                        @Param("storeId") UUID storeId,
                        @Param("fromDate") LocalDateTime fromDate,
                        @Param("toDate") LocalDateTime toDate);

        @Query("""
                        SELECT COUNT(DISTINCT o.user.id)
                        FROM Order o
                        WHERE o.storeId = :storeId
                          AND o.status = 'DELIVERED'
                          AND COALESCE(o.deliveredAt, o.createdAt) >= :fromDate
                          AND COALESCE(o.deliveredAt, o.createdAt) < :toDate
                        """)
        long countDistinctCustomersByStoreBetween(
                        @Param("storeId") UUID storeId,
                        @Param("fromDate") LocalDateTime fromDate,
                        @Param("toDate") LocalDateTime toDate);

        List<Order> findByStatusAndEscrowDeadlineAtBefore(Order.OrderStatus status, LocalDateTime cutoff);
}
