package vn.edu.hcmuaf.fit.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import vn.edu.hcmuaf.fit.marketplace.entity.Review;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ReviewRepository extends JpaRepository<Review, UUID> {
    Page<Review> findByStatus(Review.ReviewStatus status, Pageable pageable);
    Page<Review> findByStoreId(UUID storeId, Pageable pageable);
    Page<Review> findByStoreIdAndStatus(UUID storeId, Review.ReviewStatus status, Pageable pageable);
    Optional<Review> findByIdAndStoreId(UUID id, UUID storeId);
    List<Review> findByProductIdAndStatusOrderByCreatedAtDesc(UUID productId, Review.ReviewStatus status);
    List<Review> findByStoreIdAndStatusOrderByCreatedAtDesc(UUID storeId, Review.ReviewStatus status);
    @Query("""
            SELECT r FROM Review r
            JOIN FETCH r.product p
            JOIN FETCH r.user u
            LEFT JOIN FETCH r.order o
            WHERE p.id = :productId
              AND r.status <> :status
            ORDER BY r.createdAt DESC, r.id DESC
            """)
    List<Review> findVisibleProductReviews(@Param("productId") UUID productId, @Param("status") Review.ReviewStatus status);
    List<Review> findByStoreIdAndStatusNotOrderByCreatedAtDesc(UUID storeId, Review.ReviewStatus status);
    List<Review> findByUserIdOrderByCreatedAtDesc(UUID userId);
    boolean existsByUserIdAndProductIdAndOrderId(UUID userId, UUID productId, UUID orderId);

    long countByStoreId(UUID storeId);

    @Query("""
            SELECT COUNT(r) FROM Review r
            WHERE r.storeId = :storeId
              AND (r.shopReply IS NULL OR TRIM(r.shopReply) = '')
            """)
    long countByStoreIdNeedReply(@Param("storeId") UUID storeId);

    @Query("""
            SELECT COUNT(r) FROM Review r
            WHERE r.storeId = :storeId
              AND r.rating <= :maxRating
            """)
    long countByStoreIdWithMaxRating(@Param("storeId") UUID storeId, @Param("maxRating") int maxRating);

    @Query("""
            SELECT COUNT(r) FROM Review r
            WHERE r.storeId = :storeId
              AND r.shopReply IS NOT NULL
              AND TRIM(r.shopReply) <> ''
            """)
    long countByStoreIdWithReply(@Param("storeId") UUID storeId);

    @Query("""
            SELECT COALESCE(AVG(r.rating), 0)
            FROM Review r
            WHERE r.storeId = :storeId
              AND r.status <> 'HIDDEN'
            """)
    Double calculateAverageRatingByStoreId(@Param("storeId") UUID storeId);

    @Query("""
            SELECT COALESCE(AVG(r.rating), 0)
            FROM Review r
            WHERE r.storeId = :storeId
            """)
    Double calculateRawAverageRatingByStoreId(@Param("storeId") UUID storeId);

    @Query("""
            SELECT r FROM Review r
            LEFT JOIN r.order o
            LEFT JOIN r.product p
            LEFT JOIN r.user u
            WHERE r.storeId = :storeId
              AND (:status IS NULL OR r.status = :status)
              AND (:maxRating IS NULL OR r.rating <= :maxRating)
              AND (
                  :needReply IS NULL
                  OR (:needReply = true AND (r.shopReply IS NULL OR TRIM(r.shopReply) = ''))
                  OR (:needReply = false AND r.shopReply IS NOT NULL AND TRIM(r.shopReply) <> '')
              )
              AND (
                  :keyword IS NULL
                  OR :keyword = ''
                  OR LOWER(COALESCE(p.name, '')) LIKE LOWER(CONCAT('%', :keyword, '%'))
                  OR LOWER(COALESCE(r.content, '')) LIKE LOWER(CONCAT('%', :keyword, '%'))
                  OR LOWER(COALESCE(o.orderCode, '')) LIKE LOWER(CONCAT('%', :keyword, '%'))
                  OR LOWER(COALESCE(u.name, '')) LIKE LOWER(CONCAT('%', :keyword, '%'))
              )
            ORDER BY r.createdAt DESC, r.id DESC
            """)
    Page<Review> searchStoreReviews(
            @Param("storeId") UUID storeId,
            @Param("status") Review.ReviewStatus status,
            @Param("keyword") String keyword,
            @Param("needReply") Boolean needReply,
            @Param("maxRating") Integer maxRating,
            Pageable pageable
    );
}
