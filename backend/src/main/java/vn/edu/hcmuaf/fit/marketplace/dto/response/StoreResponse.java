package vn.edu.hcmuaf.fit.marketplace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StoreResponse {

    private UUID id;

    private UUID ownerId;

    private String ownerName;

    private String ownerEmail;

    private String name;

    private String slug;

    private String description;

    private String logo;

    private String banner;

    private String contactEmail;

    private String phone;

    private String address;

    private String bankName;

    private String bankAccountNumber;

    private String bankAccountHolder;

    private Boolean bankVerified;

    private Boolean notifyNewOrder;

    private Boolean notifyOrderStatusChange;

    private Boolean notifyLowStock;

    private Boolean notifyPayoutComplete;

    private Boolean notifyPromotions;

    private Boolean shipGhn;

    private Boolean shipGhtk;

    private Boolean shipExpress;

    private String warehouseAddress;

    private String warehouseContact;

    private String warehousePhone;

    private BigDecimal commissionRate;

    private Boolean usesDefaultCommissionRate;

    private BigDecimal effectiveCommissionRate;

    private String status;

    private String approvalStatus;

    private String rejectionReason;

    private LocalDateTime approvedAt;

    private String approvedBy;

    private BigDecimal totalSales;

    private Integer totalOrders;

    private Double rating;

    private Integer productCount;

    private Integer liveProductCount;

    private Integer responseRate;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
