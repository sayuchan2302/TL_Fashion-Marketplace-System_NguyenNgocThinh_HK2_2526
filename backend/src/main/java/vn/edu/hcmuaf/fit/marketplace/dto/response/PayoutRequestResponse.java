package vn.edu.hcmuaf.fit.marketplace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PayoutRequestResponse {
    private UUID id;
    private UUID storeId;
    private String storeName;
    private String storeSlug;
    private String storeLogo;
    private BigDecimal amount;
    private String bankAccountName;
    private String bankAccountNumber;
    private String bankName;
    private String status;
    private String adminNote;
    private UUID processedBy;
    private LocalDateTime processedAt;
    private LocalDateTime createdAt;
}
