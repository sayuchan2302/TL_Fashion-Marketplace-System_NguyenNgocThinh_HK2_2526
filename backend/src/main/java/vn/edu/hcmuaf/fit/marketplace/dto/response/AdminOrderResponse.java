package vn.edu.hcmuaf.fit.marketplace.dto.response;

import lombok.Builder;
import lombok.Data;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class AdminOrderResponse {
    private UUID id;
    private String code;
    private String storeName;
    private Order.OrderStatus status;
    private Order.PaymentMethod paymentMethod;
    private Order.PaymentStatus paymentStatus;
    private BigDecimal subtotal;
    private BigDecimal shippingFee;
    private BigDecimal discount;
    private BigDecimal total;
    private BigDecimal commissionFee;
    private BigDecimal commissionRateApplied;
    private BigDecimal commissionBaseAmount;
    private BigDecimal vendorPayout;
    private String trackingNumber;
    private String carrier;
    private String note;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime deliveredAt;
    private LocalDateTime escrowDeadlineAt;
    private LocalDateTime vendorConfirmationDeadlineAt;

    // Flattened user and address data to avoid lazy load issues
    private CustomerInfo customer;
    private AddressInfo shippingAddress;
    private List<ItemInfo> items;

    @Data
    @Builder
    public static class CustomerInfo {
        private String name;
        private String email;
        private String phone;
    }

    @Data
    @Builder
    public static class AddressInfo {
        private String fullName;
        private String phone;
        private String address;
        private String ward;
        private String district;
        private String city;
    }

    @Data
    @Builder
    public static class ItemInfo {
        private UUID id;
        private String name;
        private String sku;
        private String variant;
        private BigDecimal price;
        private Integer quantity;
        private String image;
    }
}
