package vn.edu.hcmuaf.fit.marketplace.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

import java.util.UUID;

@Getter
@Setter
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "return_additional_evidence", indexes = {
        @Index(name = "idx_return_additional_evidence_request_id", columnList = "evidence_request_id"),
        @Index(name = "idx_return_additional_evidence_return_id", columnList = "return_request_id")
})
public class ReturnAdditionalEvidence extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "evidence_request_id", nullable = false)
    private ReturnEvidenceRequest evidenceRequest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "return_request_id", nullable = false)
    private ReturnRequest returnRequest;

    @Enumerated(EnumType.STRING)
    @Column(name = "submitted_by_role", length = 20, nullable = false)
    private EvidenceActor submittedByRole;

    @Column(name = "submitted_by_user_id", nullable = false)
    private UUID submittedByUserId;

    @Column(name = "submitted_by_email")
    private String submittedByEmail;

    @Column(columnDefinition = "text", nullable = false)
    private String note;

    @Column(name = "evidence_url", nullable = false)
    private String evidenceUrl;

    public enum EvidenceActor {
        CUSTOMER,
        VENDOR
    }
}
