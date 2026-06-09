package vn.edu.hcmuaf.fit.marketplace.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnEvidenceRequest;

import java.util.List;
import java.util.UUID;

public interface ReturnEvidenceRequestRepository extends JpaRepository<ReturnEvidenceRequest, UUID> {
    List<ReturnEvidenceRequest> findByReturnRequestIdOrderByCreatedAtAsc(UUID returnRequestId);
}
