package vn.edu.hcmuaf.fit.marketplace.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

/**
 * Request to dispute a return by reporting customer fraud.
 * Seller provides evidence that customer is attempting fraud (e.g., swapped items).
 */
@Getter
@Setter
public class ReturnDisputeRequest {
    @NotBlank(message = "Dispute reason is required")
    private String reason;

    @NotBlank(message = "Dispute evidence is required")
    private String evidenceUrl;
}
