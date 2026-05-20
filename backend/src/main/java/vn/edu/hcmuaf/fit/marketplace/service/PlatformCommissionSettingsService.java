package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.dto.response.CommissionSettingsResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.PlatformSetting;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.repository.PlatformSettingRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
public class PlatformCommissionSettingsService {

    public static final BigDecimal DEFAULT_COMMISSION_RATE_PERCENT = new BigDecimal("5.0");

    private static final String DEFAULT_COMMISSION_RATE_KEY = "defaultCommissionRate";
    private static final BigDecimal MAX_COMMISSION_RATE_PERCENT = new BigDecimal("100");

    private final PlatformSettingRepository platformSettingRepository;
    private final StoreRepository storeRepository;
    private final AdminAuditLogService adminAuditLogService;

    public PlatformCommissionSettingsService(
            PlatformSettingRepository platformSettingRepository,
            StoreRepository storeRepository,
            AdminAuditLogService adminAuditLogService
    ) {
        this.platformSettingRepository = platformSettingRepository;
        this.storeRepository = storeRepository;
        this.adminAuditLogService = adminAuditLogService;
    }

    @Transactional(readOnly = true)
    public CommissionSettingsResponse getCommissionSettings() {
        return buildResponse(getDefaultCommissionRate());
    }

    @Transactional(readOnly = true)
    public BigDecimal getDefaultCommissionRate() {
        return platformSettingRepository.findBySettingKey(DEFAULT_COMMISSION_RATE_KEY)
                .map(PlatformSetting::getSettingValue)
                .map(this::parseRateOrDefault)
                .orElse(DEFAULT_COMMISSION_RATE_PERCENT);
    }

    @Transactional
    public CommissionSettingsResponse updateDefaultCommissionRate(
            BigDecimal defaultCommissionRate,
            UUID adminId,
            String adminEmail
    ) {
        BigDecimal normalizedRate = normalizeCommissionRate(defaultCommissionRate);
        try {
            PlatformSetting setting = platformSettingRepository.findBySettingKey(DEFAULT_COMMISSION_RATE_KEY)
                    .orElseGet(() -> PlatformSetting.builder()
                            .settingKey(DEFAULT_COMMISSION_RATE_KEY)
                            .build());
            setting.setSettingValue(normalizedRate.toPlainString());
            platformSettingRepository.save(setting);

            writeAdminAuditLog(
                    adminId,
                    adminEmail,
                    true,
                    "defaultRate=" + normalizedRate.toPlainString() + "%"
            );
            return buildResponse(normalizedRate);
        } catch (RuntimeException ex) {
            writeAdminAuditLog(adminId, adminEmail, false, ex.getMessage());
            throw ex;
        }
    }

    public BigDecimal resolveEffectiveCommissionRate(Store store) {
        if (store == null) {
            return getDefaultCommissionRate();
        }
        BigDecimal overrideRate = store.getCommissionRate();
        Boolean usesDefault = store.getUsesDefaultCommissionRate();
        if (Boolean.TRUE.equals(usesDefault)
                || (usesDefault == null && isLegacyDefaultCommissionRate(overrideRate))) {
            return getDefaultCommissionRate();
        }
        if (overrideRate == null || overrideRate.compareTo(BigDecimal.ZERO) <= 0) {
            return getDefaultCommissionRate();
        }
        return overrideRate;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void migrateLegacyStoreCommissionMode() {
        List<Store> legacyStores = storeRepository.findByUsesDefaultCommissionRateIsNull();
        if (legacyStores.isEmpty()) {
            return;
        }
        legacyStores.forEach(store -> {
            BigDecimal currentRate = store.getCommissionRate();
            boolean usesDefault = isLegacyDefaultCommissionRate(currentRate);
            store.setUsesDefaultCommissionRate(usesDefault);
        });
        storeRepository.saveAll(legacyStores);
    }

    private boolean isLegacyDefaultCommissionRate(BigDecimal currentRate) {
        return currentRate == null || currentRate.compareTo(DEFAULT_COMMISSION_RATE_PERCENT) == 0;
    }

    private CommissionSettingsResponse buildResponse(BigDecimal defaultCommissionRate) {
        return CommissionSettingsResponse.builder()
                .defaultCommissionRate(defaultCommissionRate)
                .sellersUsingDefault(storeRepository.countByUsesDefaultCommissionRateTrue())
                .sellersUsingOverride(storeRepository.countByUsesDefaultCommissionRateFalse())
                .build();
    }

    private BigDecimal parseRateOrDefault(String rawValue) {
        try {
            return normalizeCommissionRate(new BigDecimal(rawValue));
        } catch (RuntimeException ex) {
            return DEFAULT_COMMISSION_RATE_PERCENT;
        }
    }

    public BigDecimal normalizeCommissionRate(BigDecimal commissionRate) {
        if (commissionRate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Default commission rate is required");
        }
        if (commissionRate.compareTo(BigDecimal.ZERO) <= 0 || commissionRate.compareTo(MAX_COMMISSION_RATE_PERCENT) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Commission rate must be greater than 0 and less than or equal to 100");
        }
        return commissionRate.stripTrailingZeros();
    }

    private void writeAdminAuditLog(UUID actorId, String actorEmail, boolean success, String note) {
        if (adminAuditLogService == null) {
            return;
        }
        adminAuditLogService.logAction(
                actorId,
                actorEmail,
                "FINANCIAL_SETTINGS",
                "UPDATE_DEFAULT_COMMISSION_RATE",
                null,
                success,
                note
        );
    }
}
