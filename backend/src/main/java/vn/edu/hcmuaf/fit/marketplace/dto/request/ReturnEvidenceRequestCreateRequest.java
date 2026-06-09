package vn.edu.hcmuaf.fit.marketplace.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ReturnEvidenceRequestCreateRequest {
    @NotBlank(message = "Evidence request message is required")
    private String message;
}
