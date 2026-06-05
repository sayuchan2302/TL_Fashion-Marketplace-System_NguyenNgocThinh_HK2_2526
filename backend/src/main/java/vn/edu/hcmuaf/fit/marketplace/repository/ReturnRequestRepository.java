package vn.edu.hcmuaf.fit.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReturnRequestRepository
        extends JpaRepository<ReturnRequest, UUID>, JpaSpecificationExecutor<ReturnRequest> {
    interface ReturnStatusCountProjection {
        ReturnRequest.ReturnStatus getStatus();

        long getTotal();
    }

    Page<ReturnRequest> findByStatus(ReturnRequest.ReturnStatus status, Pageable pageable);

    Page<ReturnRequest> findByUserId(UUID userId, Pageable pageable);

    List<ReturnRequest> findByOrderId(UUID orderId);

    Page<ReturnRequest> findByStoreIdOrderByCreatedAtDesc(UUID storeId, Pageable pageable);

    Page<ReturnRequest> findByStoreIdAndStatusOrderByCreatedAtDesc(UUID storeId, ReturnRequest.ReturnStatus status,
            Pageable pageable);

    Optional<ReturnRequest> findByIdAndStoreId(UUID id, UUID storeId);

    long countByStatus(ReturnRequest.ReturnStatus status);

    Optional<ReturnRequest> findByReturnCode(String returnCode);

    Optional<ReturnRequest> findTopByReturnCodeStartingWithOrderByReturnCodeDesc(String returnCodePrefix);

    List<ReturnRequest> findByReturnCodeIsNullOrderByCreatedAtAscIdAsc();

    List<ReturnRequest> findByStatusAndSellerDeadlineAtBefore(ReturnRequest.ReturnStatus status,
            java.time.LocalDateTime sellerDeadlineAt);

    @Query("select r.status as status, count(r) as total from ReturnRequest r where r.storeId = :storeId group by r.status")
    List<ReturnStatusCountProjection> countGroupedByStatusForStore(@Param("storeId") UUID storeId);
}
