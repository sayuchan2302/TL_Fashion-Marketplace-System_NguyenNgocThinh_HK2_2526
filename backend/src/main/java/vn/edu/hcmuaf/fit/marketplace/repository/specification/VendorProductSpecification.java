package vn.edu.hcmuaf.fit.marketplace.repository.specification;

import org.springframework.data.jpa.domain.Specification;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.Product.ApprovalStatus;
import vn.edu.hcmuaf.fit.marketplace.entity.Product.ProductStatus;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductVariant;

import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public final class VendorProductSpecification {

    private VendorProductSpecification() {
    }

    public static Specification<Product> filterBy(
            UUID storeId,
            ProductStatus status,
            ApprovalStatus approvalStatus,
            String keyword,
            UUID categoryId,
            String inventoryState,
            int lowStockThreshold) {
        return (root, query, cb) -> {
            if (query != null && query.getResultType() != Long.class && query.getResultType() != long.class) {
                root.fetch("category", jakarta.persistence.criteria.JoinType.LEFT);
                query.distinct(true);
            }

            List<Predicate> predicates = new ArrayList<>();

            // 1. Store Id
            if (storeId != null) {
                predicates.add(cb.equal(root.get("storeId"), storeId));
            }

            // 2. Status Match
            if (status != null) {
                if (status == ProductStatus.DRAFT) {
                    predicates.add(root.get("status").in(ProductStatus.DRAFT, ProductStatus.INACTIVE));
                } else if (status == ProductStatus.ACTIVE) {
                    Predicate activeStatus = cb.equal(root.get("status"), ProductStatus.ACTIVE);
                    if (approvalStatus == null) {
                        predicates.add(cb.and(
                                activeStatus,
                                cb.or(
                                        cb.equal(root.get("approvalStatus"), ApprovalStatus.APPROVED),
                                        cb.isNull(root.get("approvalStatus")))));
                    } else {
                        predicates.add(activeStatus);
                    }
                } else {
                    predicates.add(cb.equal(root.get("status"), status));
                }
            }

            // 3. Approval status
            if (approvalStatus != null) {
                predicates.add(cb.equal(root.get("approvalStatus"), approvalStatus));
            }

            // 4. Category
            if (categoryId != null) {
                predicates.add(cb.equal(root.get("category").get("id"), categoryId));
            }

            // 5. Keyword
            String normalizedKeyword = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
            if (!normalizedKeyword.isEmpty()) {
                String keywordLike = "%" + normalizedKeyword + "%";
                Predicate productNameMatch = cb.like(cb.lower(cb.coalesce(root.get("name"), "")), keywordLike);
                Predicate productSlugMatch = cb.like(cb.lower(cb.coalesce(root.get("slug"), "")), keywordLike);
                Predicate categoryNameMatch = cb.like(cb.lower(cb.coalesce(root.get("category").get("name"), "")),
                        keywordLike);
                predicates.add(cb.or(productNameMatch, productSlugMatch, categoryNameMatch));
            }

            // 6. Inventory State (Subquery)
            if (inventoryState != null && query != null) {
                Subquery<Long> stockSubquery = query.subquery(Long.class);
                var variantRoot = stockSubquery.from(ProductVariant.class);
                stockSubquery.select(cb.coalesce(cb.sum(variantRoot.get("stockQuantity")), 0L));
                stockSubquery.where(
                        cb.and(
                                cb.equal(variantRoot.get("product"), root),
                                cb.equal(cb.coalesce(variantRoot.get("isActive"), true), true)));

                if ("OUT".equalsIgnoreCase(inventoryState)) {
                    predicates.add(cb.le(stockSubquery, 0L));
                } else if ("LOW".equalsIgnoreCase(inventoryState)) {
                    predicates.add(cb.and(
                            cb.gt(stockSubquery, 0L),
                            cb.lt(stockSubquery, (long) lowStockThreshold)));
                }
            }

            // 7. Not archived
            predicates.add(cb.notEqual(root.get("status"), ProductStatus.ARCHIVED));

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
