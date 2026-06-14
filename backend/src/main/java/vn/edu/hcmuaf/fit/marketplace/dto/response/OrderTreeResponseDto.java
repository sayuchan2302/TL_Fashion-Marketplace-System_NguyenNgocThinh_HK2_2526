package vn.edu.hcmuaf.fit.marketplace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderTreeResponseDto {
    private UUID id;
    private String code;
    private Order.OrderStatus status;
    private Order.PaymentMethod paymentMethod;
    private Order.PaymentStatus paymentStatus;
    private BigDecimal subtotal;
    private BigDecimal shippingFee;
    private BigDecimal discount;
    private BigDecimal totalAmount;
    private boolean splitOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime deliveredAt;
    private LocalDateTime escrowDeadlineAt;
    private LocalDateTime vendorConfirmationDeadlineAt;
    private Customer customer;
    private Address shippingAddress;
    private List<SubOrderNode> subOrders;
    private List<ItemNode> items;
    private List<TimelineEntry> timeline;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Customer {
        private String name;
        private String email;
        private String phone;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Address {
        private String fullName;
        private String phone;
        private String address;
        private String ward;
        private String district;
        private String city;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SubOrderNode {
        private UUID id;
        private String code;
        private UUID vendorId;
        private String vendorName;
        private Order.OrderStatus status;
        private BigDecimal subtotal;
        private BigDecimal shippingFee;
        private BigDecimal discount;
        private BigDecimal totalAmount;
        private BigDecimal commissionAmount;
        private String trackingNumber;
        private String warehouseNote;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private LocalDateTime deliveredAt;
        private LocalDateTime escrowDeadlineAt;
        private LocalDateTime vendorConfirmationDeadlineAt;
        private List<ItemNode> items;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ItemNode {
        private UUID id;
        private UUID productId;
        private String productSlug;
        private UUID variantId;
        private String name;
        private String sku;
        private String variant;
        private Integer quantity;
        private BigDecimal unitPrice;
        private BigDecimal totalPrice;
        private String image;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TimelineEntry {
        private LocalDateTime at;
        private String text;
        private String tone;
    }
}
