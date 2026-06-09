package vn.edu.hcmuaf.fit.marketplace.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnAdditionalEvidence;

import java.util.UUID;

public interface ReturnAdditionalEvidenceRepository extends JpaRepository<ReturnAdditionalEvidence, UUID> {
    boolean existsByEvidenceRequestIdAndSubmittedByRole(
            UUID evidenceRequestId,
            ReturnAdditionalEvidence.EvidenceActor submittedByRole);
}
