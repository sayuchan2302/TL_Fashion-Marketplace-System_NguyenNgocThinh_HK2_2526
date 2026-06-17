package vn.edu.hcmuaf.fit.marketplace.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Getter
@Setter
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
        name = "vouchers",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_voucher_store_code", columnNames = {"store_id", "code"})
        }
)
public class Voucher extends BaseEntity {

    @Enumerated(EnumType.STRING)
    @Column(name = "creator_role", nullable = false, length = 20)
    private CreatorRole creatorRole;

    @Column(name = "store_id", nullable = false)
    private UUID storeId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String code;

    @Column(columnDefinition = "text")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "discount_type", nullable = false, length = 20)
    private DiscountType discountType;

    @Column(name = "discount_value", nullable = false)
    private BigDecimal discountValue;

    @Column(name = "min_order_value")
    private BigDecimal minOrderValue = BigDecimal.ZERO;

    @Column(name = "total_issued")
    private Integer totalIssued = 0;

    @Column(name = "used_count")
    private Integer usedCount = 0;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private VoucherStatus status = VoucherStatus.DRAFT;

    @Column(name = "updated_by")
    private String updatedBy;

    public enum CreatorRole {
        ADMIN, VENDOR
    }

    public enum DiscountType {
        PERCENT, FIXED
    }

    public enum VoucherStatus {
        DRAFT, RUNNING, PAUSED
    }
}
