package vn.edu.hcmuaf.fit.marketplace.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
@Setter
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "stores")
public class Store extends BaseEntity {

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(unique = true)
    private String slug;

    @Column(columnDefinition = "text")
    private String description;

    private String logo;

    private String banner;

    @Column(name = "contact_email")
    private String contactEmail;

    private String phone;

    private String address;

    @Column(name = "bank_name")
    private String bankName;

    @Column(name = "bank_account_number")
    private String bankAccountNumber;

    @Column(name = "bank_account_holder")
    private String bankAccountHolder;

    @Column(name = "bank_verified")
    private Boolean bankVerified;

    @Column(name = "notify_new_order")
    private Boolean notifyNewOrder;

    @Column(name = "notify_order_status_change")
    private Boolean notifyOrderStatusChange;

    @Column(name = "notify_low_stock")
    private Boolean notifyLowStock;

    @Column(name = "notify_payout_complete")
    private Boolean notifyPayoutComplete;

    @Column(name = "notify_promotions")
    private Boolean notifyPromotions;

    @Column(name = "ship_ghn")
    private Boolean shipGhn;

    @Column(name = "ship_ghtk")
    private Boolean shipGhtk;

    @Column(name = "ship_express")
    private Boolean shipExpress;

    @Column(name = "warehouse_address")
    private String warehouseAddress;

    @Column(name = "warehouse_contact")
    private String warehouseContact;

    @Column(name = "warehouse_phone")
    private String warehousePhone;

    @Column(name = "commission_rate")
    @Builder.Default
    private BigDecimal commissionRate = new BigDecimal("5.0");

    @Column(name = "uses_default_commission_rate")
    @Builder.Default
    private Boolean usesDefaultCommissionRate = true;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private StoreStatus status = StoreStatus.INACTIVE;

    @Enumerated(EnumType.STRING)
    @Column(length = 50)
    private ApprovalStatus approvalStatus = ApprovalStatus.PENDING;

    @Column(name = "rejection_reason", columnDefinition = "text")
    private String rejectionReason;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "approved_by")
    private String approvedBy;

    @Column(name = "total_sales")
    @Builder.Default
    private BigDecimal totalSales = BigDecimal.ZERO;

    @Column(name = "total_orders")
    private Integer totalOrders = 0;

    private Double rating = 0.0;

    public enum StoreStatus {
        ACTIVE, INACTIVE, SUSPENDED
    }

    public enum ApprovalStatus {
        PENDING, APPROVED, REJECTED
    }
}
