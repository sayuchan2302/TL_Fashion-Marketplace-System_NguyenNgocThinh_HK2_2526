package vn.edu.hcmuaf.fit.marketplace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VendorReturnSummaryResponse {
    private long all;
    private long needsAction;
    private long inTransit;
    private long toInspect;
    private long disputed;
    private long completed;
}
