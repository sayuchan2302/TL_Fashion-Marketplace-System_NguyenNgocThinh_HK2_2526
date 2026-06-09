package vn.edu.hcmuaf.fit.marketplace.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
public class ReturnAdditionalEvidenceSubmitRequest {
    @NotNull(message = "Evidence request is required")
    private UUID requestId;

    @NotBlank(message = "Evidence note is required")
    private String note;

    @NotBlank(message = "Evidence URL is required")
    private String evidenceUrl;
}
