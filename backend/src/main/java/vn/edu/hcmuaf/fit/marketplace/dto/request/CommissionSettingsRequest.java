package vn.edu.hcmuaf.fit.marketplace.dto.request;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class CommissionSettingsRequest {

    private BigDecimal defaultCommissionRate;
}
