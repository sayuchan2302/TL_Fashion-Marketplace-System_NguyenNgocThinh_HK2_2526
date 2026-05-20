package vn.edu.hcmuaf.fit.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface StoreRepository extends JpaRepository<Store, UUID> {

    Optional<Store> findByOwnerId(UUID ownerId);

    Optional<Store> findBySlug(String slug);

    Optional<Store> findByIdAndApprovalStatusAndStatus(
            UUID id,
            Store.ApprovalStatus approvalStatus,
            Store.StoreStatus status
    );

    Optional<Store> findBySlugAndApprovalStatusAndStatus(
            String slug,
            Store.ApprovalStatus approvalStatus,
            Store.StoreStatus status
    );

    boolean existsByName(String name);

    boolean existsBySlug(String slug);

    List<Store> findByApprovalStatus(Store.ApprovalStatus status);

    long countByApprovalStatus(Store.ApprovalStatus status);

    List<Store> findByStatus(Store.StoreStatus status);

    List<Store> findByApprovalStatusAndStatus(Store.ApprovalStatus approvalStatus, Store.StoreStatus status);

    long countByUsesDefaultCommissionRateTrue();

    long countByUsesDefaultCommissionRateFalse();

    List<Store> findByUsesDefaultCommissionRateIsNull();

    @Query("""
            SELECT s FROM Store s
            WHERE s.approvalStatus = 'APPROVED'
              AND s.status = 'ACTIVE'
            ORDER BY COALESCE(s.rating, 0.0) DESC, COALESCE(s.totalOrders, 0) DESC, s.createdAt DESC
            """)
    List<Store> findTopPublicStores(Pageable pageable);

    @Query("""
            SELECT s FROM Store s
            WHERE s.approvalStatus = 'APPROVED'
              AND s.status = 'ACTIVE'
              AND (
                COALESCE(:keyword, '') = ''
                OR LOWER(COALESCE(s.name, '')) LIKE LOWER(CONCAT('%', :keyword, '%'))
                OR LOWER(COALESCE(s.slug, '')) LIKE LOWER(CONCAT('%', :keyword, '%'))
                OR LOWER(COALESCE(s.description, '')) LIKE LOWER(CONCAT('%', :keyword, '%'))
              )
            """)
    Page<Store> searchPublicStores(@Param("keyword") String keyword, Pageable pageable);
}
