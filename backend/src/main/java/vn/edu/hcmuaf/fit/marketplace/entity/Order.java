package vn.edu.hcmuaf.fit.marketplace.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;
import org.hibernate.annotations.Check;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Check(constraints = "status IN ('PENDING', 'WAITING_FOR_VENDOR', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'RETURNING')")
@Table(name = "orders", indexes = {
        @Index(name = "idx_orders_order_code", columnList = "order_code", unique = true),
        @Index(name = "idx_orders_store_id", columnList = "store_id"),
        @Index(name = "idx_orders_created_at", columnList = "created_at"),
        @Index(name = "idx_orders_store_created", columnList = "store_id, created_at"),
        @Index(name = "idx_orders_status_store", columnList = "status, store_id, created_at"),
        @Index(name = "idx_orders_vendor_deadline", columnList = "status, vendor_confirmation_deadline_at"),
})
public class Order extends BaseEntity {

    @Column(name = "order_code", length = 32, unique = true)
    private String orderCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "address_id", nullable = false)
    private Address shippingAddress;

    @Enumerated(EnumType.STRING)
    @Column(length = 50)
    private OrderStatus status = OrderStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", length = 50)
    private PaymentMethod paymentMethod;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", length = 50)
    private PaymentStatus paymentStatus = PaymentStatus.UNPAID;

    @Column(name = "subtotal", nullable = false)
    private BigDecimal subtotal;

    @Column(name = "shipping_fee")
    private BigDecimal shippingFee = BigDecimal.ZERO;

    @Column(name = "discount")
    private BigDecimal discount = BigDecimal.ZERO;

    @Column(name = "total", nullable = false)
    private BigDecimal total;

    @Column(name = "coupon_code")
    private String couponCode;

    @Column(name = "customer_voucher_id")
    private UUID customerVoucherId;

    @Builder.Default
    @Column(name = "discount_usage_consumed")
    private Boolean discountUsageConsumed = false;

    @Column(name = "tracking_number")
    private String trackingNumber;

    @Column(name = "shipping_carrier")
    private String shippingCarrier;

    @Column(name = "warehouse_note", columnDefinition = "text")
    private String warehouseNote;

    @Column(name = "vendor_confirmation_deadline_at")
    private LocalDateTime vendorConfirmationDeadlineAt;

    @Column(name = "store_id")
    private UUID storeId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_order_id")
    private Order parentOrder;

    @Builder.Default
    @OneToMany(mappedBy = "parentOrder", cascade = CascadeType.ALL)
    private List<Order> subOrders = new ArrayList<>();

    @Column(name = "commission_fee")
    private BigDecimal commissionFee = BigDecimal.ZERO;

    @Column(name = "commission_rate_applied")
    private BigDecimal commissionRateApplied = BigDecimal.ZERO;

    @Column(name = "commission_base_amount")
    private BigDecimal commissionBaseAmount = BigDecimal.ZERO;

    @Column(name = "vendor_payout")
    private BigDecimal vendorPayout = BigDecimal.ZERO;

    @Column(columnDefinition = "text")
    private String note;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @Column(name = "delivered_at")
    private LocalDateTime deliveredAt;

    @Column(name = "escrow_deadline_at")
    private LocalDateTime escrowDeadlineAt;

    @Column(name = "escrow_remaining_seconds")
    private Long escrowRemainingSeconds;

    @Builder.Default
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItem> items = new ArrayList<>();

    public boolean isParentOrder() {
        return parentOrder == null && storeId == null;
    }

    public boolean isSubOrder() {
        return parentOrder != null && storeId != null;
    }

    public enum OrderStatus {
        PENDING, WAITING_FOR_VENDOR, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, COMPLETED, CANCELLED, RETURNING
    }

    public enum PaymentMethod {
        COD, VNPAY, ZALOPAY, MOMO, BANK_TRANSFER
    }

    public enum PaymentStatus {
        UNPAID, PAID, REFUND_PENDING, REFUNDED, FAILED
    }

    public void calculateTotal() {
        BigDecimal base = subtotal != null ? subtotal : BigDecimal.ZERO;
        BigDecimal fee = shippingFee != null ? shippingFee : BigDecimal.ZERO;
        BigDecimal disc = discount != null ? discount : BigDecimal.ZERO;
        this.total = base.add(fee).subtract(disc);
    }
}
