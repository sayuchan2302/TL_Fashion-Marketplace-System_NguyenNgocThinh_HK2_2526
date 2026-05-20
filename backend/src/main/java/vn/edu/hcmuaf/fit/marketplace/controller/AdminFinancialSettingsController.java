package vn.edu.hcmuaf.fit.marketplace.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.edu.hcmuaf.fit.marketplace.dto.request.CommissionSettingsRequest;
import vn.edu.hcmuaf.fit.marketplace.dto.response.CommissionSettingsResponse;
import vn.edu.hcmuaf.fit.marketplace.security.AuthContext;
import vn.edu.hcmuaf.fit.marketplace.service.PlatformCommissionSettingsService;

@RestController
@RequestMapping("/api/admin/financial-settings")
public class AdminFinancialSettingsController {

    private final PlatformCommissionSettingsService platformCommissionSettingsService;
    private final AuthContext authContext;

    public AdminFinancialSettingsController(
            PlatformCommissionSettingsService platformCommissionSettingsService,
            AuthContext authContext
    ) {
        this.platformCommissionSettingsService = platformCommissionSettingsService;
        this.authContext = authContext;
    }

    @GetMapping("/commission")
    public ResponseEntity<CommissionSettingsResponse> getCommissionSettings() {
        return ResponseEntity.ok(platformCommissionSettingsService.getCommissionSettings());
    }

    @PatchMapping("/commission")
    public ResponseEntity<CommissionSettingsResponse> updateCommissionSettings(
            @RequestHeader("Authorization") String authHeader,
            @RequestBody CommissionSettingsRequest request
    ) {
        AuthContext.UserContext admin = authContext.requireAdmin(authHeader);
        return ResponseEntity.ok(platformCommissionSettingsService.updateDefaultCommissionRate(
                request.getDefaultCommissionRate(),
                admin.getUserId(),
                admin.getEmail()
        ));
    }
}
