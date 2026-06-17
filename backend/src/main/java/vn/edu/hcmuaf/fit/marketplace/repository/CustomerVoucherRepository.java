package vn.edu.hcmuaf.fit.marketplace.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import vn.edu.hcmuaf.fit.marketplace.entity.CustomerVoucher;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CustomerVoucherRepository extends JpaRepository<CustomerVoucher, UUID> {

    @Query("""
            SELECT cv
            FROM CustomerVoucher cv
            JOIN cv.voucher v
            WHERE cv.user.id = :userId
            ORDER BY cv.createdAt DESC
            """)
    Page<CustomerVoucher> findWalletByUserId(
            @Param("userId") UUID userId,
            Pageable pageable
    );

    @Query("""
            SELECT cv
            FROM CustomerVoucher cv
            JOIN cv.voucher v
            WHERE cv.user.id = :userId
              AND cv.walletStatus = :walletStatus
            ORDER BY cv.createdAt DESC
            """)
    Page<CustomerVoucher> findWalletByUserIdAndStatus(
            @Param("userId") UUID userId,
            @Param("walletStatus") CustomerVoucher.WalletStatus walletStatus,
            Pageable pageable
    );

    boolean existsByUserIdAndVoucherId(UUID userId, UUID voucherId);

    Optional<CustomerVoucher> findByUserIdAndVoucherId(UUID userId, UUID voucherId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT cv
            FROM CustomerVoucher cv
            JOIN FETCH cv.voucher v
            WHERE cv.id = :id
              AND cv.user.id = :userId
            """)
    Optional<CustomerVoucher> findByIdAndUserIdForUpdate(
            @Param("id") UUID id,
            @Param("userId") UUID userId
    );

    @Query("""
            SELECT cv.user.id
            FROM CustomerVoucher cv
            WHERE cv.voucher.id = :voucherId
              AND cv.user.id IN :userIds
            """)
    List<UUID> findAssignedUserIdsByVoucherIdAndUserIds(
            @Param("voucherId") UUID voucherId,
            @Param("userIds") Collection<UUID> userIds
    );

    @Modifying
    @Query("UPDATE CustomerVoucher cv SET cv.walletStatus = 'REVOKED' WHERE cv.voucher.id = :voucherId AND cv.walletStatus = 'AVAILABLE'")
    int revokeByVoucherId(@Param("voucherId") UUID voucherId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM CustomerVoucher cv WHERE cv.voucher.id = :voucherId")
    int deleteByVoucherId(@Param("voucherId") UUID voucherId);
}
