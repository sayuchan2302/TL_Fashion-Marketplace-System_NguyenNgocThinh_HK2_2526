package vn.edu.hcmuaf.fit.marketplace.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorProductPageResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Category;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductAuditLog;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductImage;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductVariant;
import vn.edu.hcmuaf.fit.marketplace.repository.CategoryRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductAuditLogRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductVariantRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductServiceSalesAggregatesTest {

        @Mock
        private ProductRepository productRepository;
        @Mock
        private CategoryRepository categoryRepository;
        @Mock
        private ProductVariantRepository productVariantRepository;
        @Mock
        private StoreRepository storeRepository;
        @Mock
        private OrderRepository orderRepository;
        @Mock
        private ProductAuditLogRepository productAuditLogRepository;

        @InjectMocks
        private ProductService productService;

        @Test
        void getVendorProductPageIncludesDeliveredSalesAggregates() {
                UUID storeId = UUID.randomUUID();
                UUID productId = UUID.randomUUID();

                Category category = new Category();
                category.setId(UUID.randomUUID());
                category.setName("Ao");

                Product product = Product.builder()
                                .id(productId)
                                .name("Ao polo")
                                .slug("ao-polo")
                                .category(category)
                                .basePrice(new BigDecimal("250000"))
                                .salePrice(new BigDecimal("199000"))
                                .status(Product.ProductStatus.ACTIVE)
                                .approvalStatus(Product.ApprovalStatus.APPROVED)
                                .build();
                product.setVariants(List.of(ProductVariant.builder()
                                .sku("AO-POLO-001")
                                .stockQuantity(25)
                                .isActive(true)
                                .build()));
                product.setImages(List.of(ProductImage.builder()
                                .url("https://cdn.example/ao-polo.jpg")
                                .isPrimary(true)
                                .build()));

                when(productRepository.findAll(any(Specification.class), any(Pageable.class)))
                                .thenReturn(new PageImpl<>(List.of(product), PageRequest.of(0, 10), 1));

                when(productRepository.countByStoreIdExcludingArchived(storeId)).thenReturn(1L);
                when(productRepository.countVisibleByStoreId(storeId)).thenReturn(1L);
                when(productRepository.countByStoreIdAndStatus(storeId, Product.ProductStatus.DRAFT)).thenReturn(0L);
                when(productRepository.countByStoreIdAndStatus(storeId, Product.ProductStatus.INACTIVE)).thenReturn(0L);
                when(productRepository.countOutOfStockByStoreId(storeId)).thenReturn(0L);
                when(productRepository.countLowStockByStoreId(storeId, 10)).thenReturn(0L);
                when(productRepository.countBannedByStoreId(storeId)).thenReturn(0L);

                when(orderRepository.findDeliveredProductSalesByStoreAndProductIds(eq(storeId), any()))
                                .thenReturn(List.of(projection(
                                                productId,
                                                "Ao polo",
                                                "https://cdn.example/ao-polo.jpg",
                                                17L,
                                                new BigDecimal("3383000"))));

                VendorProductPageResponse page = productService.getVendorProductPage(
                                storeId,
                                Product.ProductStatus.ACTIVE,
                                null,
                                "ao",
                                null,
                                null,
                                PageRequest.of(0, 10));

                assertEquals(1, page.getContent().size());
                assertEquals(17L, page.getContent().get(0).getSoldCount());
                assertEquals(new BigDecimal("3383000"), page.getContent().get(0).getGrossRevenue());
                assertEquals("APPROVED", page.getContent().get(0).getApprovalStatus());
                assertEquals(Boolean.TRUE, page.getContent().get(0).getVisible());
        }

        @Test
        void getVendorProductPageSkipsSalesQueryWhenPageEmpty() {
                UUID storeId = UUID.randomUUID();
                when(productRepository.findAll(any(Specification.class), any(Pageable.class)))
                                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 10), 0));

                when(productRepository.countByStoreIdExcludingArchived(storeId)).thenReturn(0L);
                when(productRepository.countVisibleByStoreId(storeId)).thenReturn(0L);
                when(productRepository.countByStoreIdAndStatus(storeId, Product.ProductStatus.DRAFT)).thenReturn(0L);
                when(productRepository.countByStoreIdAndStatus(storeId, Product.ProductStatus.INACTIVE)).thenReturn(0L);
                when(productRepository.countOutOfStockByStoreId(storeId)).thenReturn(0L);
                when(productRepository.countLowStockByStoreId(storeId, 10)).thenReturn(0L);
                when(productRepository.countBannedByStoreId(storeId)).thenReturn(0L);

                VendorProductPageResponse page = productService.getVendorProductPage(
                                storeId,
                                null,
                                null,
                                null,
                                null,
                                null,
                                PageRequest.of(0, 10));

                assertEquals(0, page.getContent().size());
                verify(orderRepository, never()).findDeliveredProductSalesByStoreAndProductIds(eq(storeId), any());
        }

        @Test
        void getVendorProductPageMarksBannedActiveProductAsNotVisible() {
                UUID storeId = UUID.randomUUID();
                UUID productId = UUID.randomUUID();

                Product product = Product.builder()
                                .id(productId)
                                .name("Banned shirt")
                                .slug("banned-shirt")
                                .basePrice(new BigDecimal("120000"))
                                .status(Product.ProductStatus.ACTIVE)
                                .approvalStatus(Product.ApprovalStatus.BANNED)
                                .build();
                product.setVariants(List.of(ProductVariant.builder()
                                .sku("BAN-001")
                                .stockQuantity(30)
                                .isActive(true)
                                .build()));

                when(productRepository.findAll(any(Specification.class), any(Pageable.class)))
                                .thenReturn(new PageImpl<>(List.of(product), PageRequest.of(0, 10), 1));

                when(productRepository.countByStoreIdExcludingArchived(storeId)).thenReturn(1L);
                when(productRepository.countVisibleByStoreId(storeId)).thenReturn(0L);
                when(productRepository.countByStoreIdAndStatus(storeId, Product.ProductStatus.DRAFT)).thenReturn(0L);
                when(productRepository.countByStoreIdAndStatus(storeId, Product.ProductStatus.INACTIVE)).thenReturn(0L);
                when(productRepository.countOutOfStockByStoreId(storeId)).thenReturn(0L);
                when(productRepository.countLowStockByStoreId(storeId, 10)).thenReturn(0L);
                when(productRepository.countBannedByStoreId(storeId)).thenReturn(1L);
                when(productAuditLogRepository.findVendorBlockReasonCandidates(
                                eq(List.of(productId)),
                                eq(List.of(
                                                ProductAuditLog.Action.BANNED,
                                                ProductAuditLog.Action.REJECTED,
                                                ProductAuditLog.Action.REPORT_CONFIRMED))))
                                .thenReturn(List.of(ProductAuditLog.builder()
                                                .productId(productId)
                                                .action(ProductAuditLog.Action.BANNED)
                                                .reason("Vi phạm chính sách sản phẩm")
                                                .build()));
                when(orderRepository.findDeliveredProductSalesByStoreAndProductIds(eq(storeId), any()))
                                .thenReturn(List.of());

                VendorProductPageResponse page = productService.getVendorProductPage(
                                storeId,
                                null,
                                null,
                                null,
                                null,
                                null,
                                PageRequest.of(0, 10));

                assertEquals(1, page.getContent().size());
                assertEquals("ACTIVE", page.getContent().get(0).getStatus());
                assertEquals("BANNED", page.getContent().get(0).getApprovalStatus());
                assertEquals("Vi phạm chính sách sản phẩm", page.getContent().get(0).getModerationReason());
                assertEquals(Boolean.FALSE, page.getContent().get(0).getVisible());
                assertEquals(0L, page.getStatusCounts().getActive());
                assertEquals(1L, page.getStatusCounts().getBanned());
        }

        private static OrderRepository.ProductSalesProjection projection(
                        UUID productId,
                        String productName,
                        String productImage,
                        Long soldCount,
                        BigDecimal grossRevenue) {
                return new OrderRepository.ProductSalesProjection() {
                        @Override
                        public UUID getProductId() {
                                return productId;
                        }

                        @Override
                        public String getProductName() {
                                return productName;
                        }

                        @Override
                        public String getProductImage() {
                                return productImage;
                        }

                        @Override
                        public Long getSoldCount() {
                                return soldCount;
                        }

                        @Override
                        public BigDecimal getGrossRevenue() {
                                return grossRevenue;
                        }
                };
        }
}
