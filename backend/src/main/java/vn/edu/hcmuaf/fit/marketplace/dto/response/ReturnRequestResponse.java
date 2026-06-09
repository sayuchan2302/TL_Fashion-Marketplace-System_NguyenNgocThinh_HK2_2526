package vn.edu.hcmuaf.fit.marketplace.dto.response;

import lombok.Builder;
import lombok.Getter;
import vn.edu.hcmuaf.fit.marketplace.entity.ReturnRequest;

import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Getter
@Builder
public class ReturnRequestResponse {
    private UUID id;
    private String code;
    private UUID orderId;
    private String orderCode;
    private UUID userId;
    private String customerName;
    private String customerEmail;
    private String customerPhone;
    private ReturnRequest.ReturnReason reason;
    private String note;
    private ReturnRequest.ReturnResolution resolution;
    private ReturnRequest.ReturnStatus status;
    private UUID storeId;
    private String storeName;
    private List<ReturnItem> items;
    private BigDecimal refundAmount;
    private String vendorReason;
    private String disputeReason;
    private String disputeEvidenceUrl;
    private String shippingTrackingNumber;
    private String shippingCarrier;
    private String adminNote;
    private String updatedBy;
    private LocalDateTime shippedAt;
    private LocalDateTime receivedAt;
    private LocalDateTime sellerDeadlineAt;
    private LocalDateTime completedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<AdditionalEvidenceRequest> additionalEvidenceRequests;

    @Getter
    @Builder
    public static class ReturnItem {
        private UUID orderItemId;
        private String productName;
        private String variantName;
        private String imageUrl;
        private String evidenceUrl;
        private Integer quantity;
        private BigDecimal unitPrice;
    }

    @Getter
    @Builder
    public static class AdditionalEvidenceRequest {
        private UUID id;
        private String message;
        private String requestedBy;
        private LocalDateTime requestedAt;
        private List<AdditionalEvidence> evidence;
    }

    @Getter
    @Builder
    public static class AdditionalEvidence {
        private UUID id;
        private String submittedByRole;
        private UUID submittedByUserId;
        private String submittedByEmail;
        private String note;
        private String evidenceUrl;
        private LocalDateTime createdAt;
    }
}
