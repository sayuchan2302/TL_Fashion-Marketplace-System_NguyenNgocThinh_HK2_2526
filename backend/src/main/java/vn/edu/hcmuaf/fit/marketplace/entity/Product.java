package vn.edu.hcmuaf.fit.marketplace.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.BatchSize;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "products")
public class Product extends BaseEntity {

    @Column(nullable = false)
    private String name;

    @Column(unique = true)
    private String slug;

    @Column(unique = true)
    private String sku;

    @Column(name = "stock_quantity")
    @Builder.Default
    private Integer stockQuantity = 0;

    @org.hibernate.annotations.Formula("(SELECT COALESCE(SUM(v.stock_quantity), 0) FROM product_variants v WHERE v.product_id = id AND COALESCE(v.is_active, true) = true)")
    private Integer totalStockFormula;

    @Column(name = "store_id")
    private UUID storeId;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "size_and_fit", columnDefinition = "text")
    private String sizeAndFit;

    @Column(name = "fabric_and_care", columnDefinition = "text")
    private String fabricAndCare;

    @Column(columnDefinition = "text")
    private String highlights;

    @Column(name = "care_instructions", columnDefinition = "text")
    private String careInstructions;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @Column(name = "base_price")
    private BigDecimal basePrice;

    @Column(name = "sale_price")
    private BigDecimal salePrice;

    @Column(name = "image_url")
    private String imageUrl;

    private String material;

    private String fit;

    @Enumerated(EnumType.STRING)
    private Gender gender;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    @Builder.Default
    private ProductStatus status = ProductStatus.ACTIVE;

    @Enumerated(EnumType.STRING)
    @Column(name = "approval_status", length = 20)
    @Builder.Default
    private ApprovalStatus approvalStatus = ApprovalStatus.APPROVED;

    @Column(name = "is_featured")
    @Builder.Default
    private Boolean isFeatured = false;

    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
    @BatchSize(size = 50)
    @Builder.Default
    private List<ProductImage> images = new ArrayList<>();

    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
    @BatchSize(size = 50)
    @Builder.Default
    private List<ProductVariant> variants = new ArrayList<>();

    @Builder.Default
    private Integer viewCount = 0;

    @Transient
    @Builder.Default
    private Long soldCount = 0L;

    public enum Gender {
        MALE, FEMALE, UNISEX
    }

    public enum ProductStatus {
        ACTIVE, INACTIVE, DRAFT, ARCHIVED
    }

    public enum ApprovalStatus {
        PENDING, APPROVED, REJECTED, BANNED, UNDER_REVIEW
    }

    public BigDecimal getEffectivePrice() {
        return salePrice != null && salePrice.compareTo(BigDecimal.ZERO) > 0 ? salePrice : basePrice;
    }
}
