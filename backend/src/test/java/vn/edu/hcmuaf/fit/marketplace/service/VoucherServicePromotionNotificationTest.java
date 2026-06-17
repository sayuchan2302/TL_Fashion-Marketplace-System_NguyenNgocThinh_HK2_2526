package vn.edu.hcmuaf.fit.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import vn.edu.hcmuaf.fit.marketplace.dto.request.MarketplaceCampaignRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.request.VoucherRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.request.VoucherStatusUpdateRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.MarketplaceCampaignResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.Voucher;
import vn.edu.hcmuaf.fit.marketplace.repository.CustomerVoucherRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.VoucherRepository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VoucherServicePromotionNotificationTest {

    @Mock
    private VoucherRepository voucherRepository;

    @Mock
    private StoreRepository storeRepository;

    @Mock
    private CustomerVoucherRepository customerVoucherRepository;

    private CapturingPromotionNotificationService promotionNotificationService;
    private NoopCustomerVoucherService customerVoucherService;
    private VoucherService voucherService;

    @BeforeEach
    void setUp() {
        promotionNotificationService = new CapturingPromotionNotificationService();
        customerVoucherService = new NoopCustomerVoucherService();
        voucherService = new VoucherService(
                voucherRepository,
                storeRepository,
                promotionNotificationService,
                customerVoucherService,
                customerVoucherRepository
        );
    }

    @Test
    void createRunningVoucherNotifiesStoreFollowers() {
        UUID storeId = UUID.randomUUID();
        VoucherRequest request = buildVoucherRequest(Voucher.VoucherStatus.RUNNING, LocalDate.now(), LocalDate.now().plusDays(7));
        when(voucherRepository.save(any(Voucher.class))).thenAnswer(invocation -> {
            Voucher voucher = invocation.getArgument(0);
            voucher.setId(UUID.randomUUID());
            return voucher;
        });
        when(storeRepository.findById(storeId)).thenReturn(Optional.of(Store.builder().id(storeId).name("Store A").build()));

        voucherService.create(storeId, request, "vendor@test.local");

        assertEquals(1, promotionNotificationService.storeVoucherInvocations.size());
    }

    @Test
    void updateRunningVoucherWithoutTransitionDoesNotNotify() {
        UUID storeId = UUID.randomUUID();
        UUID voucherId = UUID.randomUUID();
        Voucher existing = buildExistingVoucher(storeId, voucherId, Voucher.VoucherStatus.RUNNING);
        VoucherRequest request = buildVoucherRequest(Voucher.VoucherStatus.RUNNING, LocalDate.now(), LocalDate.now().plusDays(3));

        when(voucherRepository.findByIdAndStoreId(voucherId, storeId)).thenReturn(Optional.of(existing));
        when(voucherRepository.save(any(Voucher.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(storeRepository.findById(storeId)).thenReturn(Optional.of(Store.builder().id(storeId).name("Store A").build()));

        voucherService.update(storeId, voucherId, request, "vendor@test.local");

        assertTrue(promotionNotificationService.storeVoucherInvocations.isEmpty());
    }

    @Test
    void updateStatusFromDraftToRunningNotifiesStoreFollowers() {
        UUID storeId = UUID.randomUUID();
        UUID voucherId = UUID.randomUUID();
        Voucher existing = buildExistingVoucher(storeId, voucherId, Voucher.VoucherStatus.DRAFT);
        VoucherStatusUpdateRequest request = new VoucherStatusUpdateRequest();
        request.setStatus(Voucher.VoucherStatus.RUNNING);

        when(voucherRepository.findByIdAndStoreId(voucherId, storeId)).thenReturn(Optional.of(existing));
        when(voucherRepository.save(any(Voucher.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(storeRepository.findById(storeId)).thenReturn(Optional.of(Store.builder().id(storeId).name("Store A").build()));

        voucherService.updateStatus(storeId, voucherId, request, "vendor@test.local");

        assertEquals(1, promotionNotificationService.storeVoucherInvocations.size());
    }

    @Test
    void createMarketplaceCampaignCreatesForApprovedStoresAndNotifiesOnce() {
        UUID storeA = UUID.randomUUID();
        UUID storeB = UUID.randomUUID();
        Store approvedA = Store.builder().id(storeA).name("A").status(Store.StoreStatus.ACTIVE).approvalStatus(Store.ApprovalStatus.APPROVED).build();
        Store approvedB = Store.builder().id(storeB).name("B").status(Store.StoreStatus.ACTIVE).approvalStatus(Store.ApprovalStatus.APPROVED).build();
        MarketplaceCampaignRequest request = buildCampaignRequest();

        when(storeRepository.findByApprovalStatusAndStatus(Store.ApprovalStatus.APPROVED, Store.StoreStatus.ACTIVE))
                .thenReturn(List.of(approvedA, approvedB));
        when(voucherRepository.findByStoreIdAndCode(eq(storeA), eq("MEGA123"))).thenReturn(Optional.empty());
        when(voucherRepository.findByStoreIdAndCode(eq(storeB), eq("MEGA123"))).thenReturn(Optional.empty());
        when(voucherRepository.save(any(Voucher.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MarketplaceCampaignResponse response = voucherService.createAdminMarketplaceCampaign(request, "admin@test.local");

        assertEquals(2, response.getCreatedCount());
        assertEquals(0, response.getFailedCount());
        assertEquals(1, promotionNotificationService.marketplaceCampaignCodes.size());
        assertEquals("MEGA123", promotionNotificationService.marketplaceCampaignCodes.get(0));
        assertEquals(request.getStartDate(), promotionNotificationService.marketplaceCampaignStartDates.get(0));
        assertEquals(request.getEndDate(), promotionNotificationService.marketplaceCampaignEndDates.get(0));
    }

    @Test
    void deleteVoucherDeletesCustomerWalletRowsBeforeVoucher() {
        UUID storeId = UUID.randomUUID();
        UUID voucherId = UUID.randomUUID();
        Voucher existing = buildExistingVoucher(storeId, voucherId, Voucher.VoucherStatus.RUNNING);

        when(voucherRepository.findByIdAndStoreId(voucherId, storeId)).thenReturn(Optional.of(existing));

        voucherService.delete(storeId, voucherId);

        InOrder inOrder = inOrder(customerVoucherRepository, voucherRepository);
        inOrder.verify(customerVoucherRepository).deleteByVoucherId(voucherId);
        inOrder.verify(voucherRepository).delete(existing);
    }

    @Test
    void deleteAdminVoucherDeletesCustomerWalletRowsBeforeVoucher() {
        UUID storeId = UUID.randomUUID();
        UUID voucherId = UUID.randomUUID();
        Voucher existing = buildExistingVoucher(storeId, voucherId, Voucher.VoucherStatus.RUNNING);

        when(voucherRepository.findById(voucherId)).thenReturn(Optional.of(existing));

        voucherService.deleteAdmin(voucherId);

        InOrder inOrder = inOrder(customerVoucherRepository, voucherRepository);
        inOrder.verify(customerVoucherRepository).deleteByVoucherId(voucherId);
        inOrder.verify(voucherRepository).deleteById(voucherId);
    }

    private VoucherRequest buildVoucherRequest(
            Voucher.VoucherStatus status,
            LocalDate startDate,
            LocalDate endDate
    ) {
        VoucherRequest request = new VoucherRequest();
        request.setName("Voucher demo");
        request.setCode("VC10");
        request.setDescription("Demo");
        request.setDiscountType(Voucher.DiscountType.PERCENT);
        request.setDiscountValue(new BigDecimal("10"));
        request.setMinOrderValue(BigDecimal.ZERO);
        request.setTotalIssued(100);
        request.setStartDate(startDate);
        request.setEndDate(endDate);
        request.setStatus(status);
        return request;
    }

    private MarketplaceCampaignRequest buildCampaignRequest() {
        MarketplaceCampaignRequest request = new MarketplaceCampaignRequest();
        request.setName("Mega Sale");
        request.setCode("MEGA123");
        request.setDescription("Marketplace");
        request.setDiscountType(Voucher.DiscountType.PERCENT);
        request.setDiscountValue(new BigDecimal("15"));
        request.setMinOrderValue(BigDecimal.ZERO);
        request.setTotalIssued(1000);
        request.setStartDate(LocalDate.now());
        request.setEndDate(LocalDate.now().plusDays(10));
        request.setStatus(Voucher.VoucherStatus.RUNNING);
        return request;
    }

    private Voucher buildExistingVoucher(UUID storeId, UUID voucherId, Voucher.VoucherStatus status) {
        Voucher voucher = Voucher.builder()
                .id(voucherId)
                .storeId(storeId)
                .name("Voucher old")
                .code("OLDVC")
                .description("old")
                .discountType(Voucher.DiscountType.PERCENT)
                .discountValue(new BigDecimal("10"))
                .minOrderValue(BigDecimal.ZERO)
                .totalIssued(100)
                .usedCount(10)
                .startDate(LocalDate.now())
                .endDate(LocalDate.now().plusDays(5))
                .status(status)
                .build();
        voucher.setId(voucherId);
        return voucher;
    }

    private static final class CapturingPromotionNotificationService extends PromotionNotificationService {
        private final List<Voucher> storeVoucherInvocations = new ArrayList<>();
        private final List<String> marketplaceCampaignCodes = new ArrayList<>();
        private final List<LocalDate> marketplaceCampaignStartDates = new ArrayList<>();
        private final List<LocalDate> marketplaceCampaignEndDates = new ArrayList<>();

        private CapturingPromotionNotificationService() {
            super(null, null, null, null, null, null);
        }

        @Override
        public void notifyStoreFollowersForRunningVoucher(Voucher voucher) {
            storeVoucherInvocations.add(voucher);
        }

        @Override
        public void notifyMarketplaceCampaign(String voucherCode, LocalDate startDate, LocalDate endDate) {
            marketplaceCampaignCodes.add(voucherCode);
            marketplaceCampaignStartDates.add(startDate);
            marketplaceCampaignEndDates.add(endDate);
        }
    }

    private static final class NoopCustomerVoucherService extends CustomerVoucherService {

        private NoopCustomerVoucherService() {
            super(null, null, null, null, null);
        }

        @Override
        public int assignVoucherToAllActiveCustomers(Voucher voucher) {
            return 0;
        }

        @Override
        public int assignVoucherToStoreFollowers(Voucher voucher) {
            return 0;
        }
    }
}
