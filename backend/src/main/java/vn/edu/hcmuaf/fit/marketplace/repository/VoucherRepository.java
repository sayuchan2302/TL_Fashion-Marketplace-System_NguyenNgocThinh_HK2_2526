package vn.edu.hcmuaf.fit.marketplace.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import vn.edu.hcmuaf.fit.marketplace.entity.Voucher;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface VoucherRepository extends JpaRepository<Voucher, UUID> {

    @Query("""
            SELECT v FROM Voucher v
            WHERE v.storeId = :storeId
              AND v.creatorRole = 'VENDOR'
              AND (:status IS NULL OR v.status = :status)
              AND (
                  COALESCE(:keyword, '') = ''
                  OR LOWER(v.name) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                  OR LOWER(v.code) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                  OR LOWER(COALESCE(v.description, '')) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
              )
            """)
    Page<Voucher> searchByStore(
            @Param("storeId") UUID storeId,
            @Param("status") Voucher.VoucherStatus status,
            @Param("keyword") String keyword,
            Pageable pageable
    );

    @Query("""
            SELECT v FROM Voucher v
            WHERE (:status IS NULL OR v.status = :status)
              AND (
                  COALESCE(:keyword, '') = ''
                  OR LOWER(v.name) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                  OR LOWER(v.code) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
                  OR LOWER(COALESCE(v.description, '')) LIKE LOWER(CONCAT('%', COALESCE(:keyword, ''), '%'))
              )
            """)
    Page<Voucher> searchAll(
            @Param("status") Voucher.VoucherStatus status,
            @Param("keyword") String keyword,
            Pageable pageable
    );

    @Query("""
            SELECT v FROM Voucher v
            WHERE v.id = :id AND v.storeId = :storeId AND v.creatorRole = 'VENDOR'
            """)
    Optional<Voucher> findByIdAndStoreId(@Param("id") UUID id, @Param("storeId") UUID storeId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT v
            FROM Voucher v
            WHERE v.id = :id
            """)
    Optional<Voucher> findByIdForUpdate(@Param("id") UUID id);

    Optional<Voucher> findByStoreIdAndCode(UUID storeId, String code);

    @Query("""
            SELECT COUNT(v) > 0
            FROM Voucher v
            WHERE UPPER(v.code) = UPPER(:code)
              AND v.status = :status
              AND (v.startDate IS NULL OR v.startDate <= :today)
              AND (v.endDate IS NULL OR v.endDate >= :today)
              AND COALESCE(v.usedCount, 0) < COALESCE(v.totalIssued, 0)
            """)
    boolean existsPublicAvailableByCode(
            @Param("code") String code,
            @Param("status") Voucher.VoucherStatus status,
            @Param("today") LocalDate today
    );

    @Query("""
            SELECT v FROM Voucher v
            WHERE UPPER(v.code) = UPPER(:code)
              AND v.storeId IN :storeIds
            """)
    List<Voucher> findByCodeAndStoreIds(
            @Param("code") String code,
            @Param("storeIds") Collection<UUID> storeIds
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT v FROM Voucher v
            WHERE UPPER(v.code) = UPPER(:code)
              AND v.storeId IN :storeIds
            """)
    List<Voucher> findByCodeAndStoreIdsForUpdate(
            @Param("code") String code,
            @Param("storeIds") Collection<UUID> storeIds
    );

    @Query("""
            SELECT v FROM Voucher v
            WHERE v.status = :status
              AND v.creatorRole = 'VENDOR'
              AND v.storeId IN :storeIds
              AND (v.startDate IS NULL OR v.startDate <= :today)
              AND (v.endDate IS NULL OR v.endDate >= :today)
              AND COALESCE(v.usedCount, 0) < COALESCE(v.totalIssued, 0)
            ORDER BY v.endDate ASC, v.createdAt DESC
            """)
    List<Voucher> findPublicAvailableByStoreIds(
            @Param("status") Voucher.VoucherStatus status,
            @Param("storeIds") Collection<UUID> storeIds,
            @Param("today") LocalDate today
    );

    @Query("""
            SELECT v FROM Voucher v
            WHERE v.status = :status
              AND v.creatorRole = 'VENDOR'
              AND (v.startDate IS NULL OR v.startDate <= :today)
              AND (v.endDate IS NULL OR v.endDate >= :today)
              AND COALESCE(v.usedCount, 0) < COALESCE(v.totalIssued, 0)
            ORDER BY v.endDate ASC, v.createdAt DESC
            """)
    List<Voucher> findPublicAvailable(
            @Param("status") Voucher.VoucherStatus status,
            @Param("today") LocalDate today
    );

    @Query("SELECT COUNT(v) FROM Voucher v WHERE v.storeId = :storeId AND v.creatorRole = 'VENDOR'")
    long countByStoreId(@Param("storeId") UUID storeId);

    @Query("SELECT COUNT(v) FROM Voucher v WHERE v.storeId = :storeId AND v.status = :status AND v.creatorRole = 'VENDOR'")
    long countByStoreIdAndStatus(@Param("storeId") UUID storeId, @Param("status") Voucher.VoucherStatus status);

    long countByStatus(Voucher.VoucherStatus status);

    @Query("""
            SELECT COALESCE(SUM(v.usedCount), 0) FROM Voucher v
            WHERE v.storeId = :storeId AND v.creatorRole = 'VENDOR'
            """)
    long sumUsedCountByStoreId(@Param("storeId") UUID storeId);

    @Query("SELECT COALESCE(SUM(v.usedCount), 0) FROM Voucher v")
    long sumUsedCount();
}
