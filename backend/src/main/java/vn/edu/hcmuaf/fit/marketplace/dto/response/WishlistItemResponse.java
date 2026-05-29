package vn.edu.hcmuaf.fit.marketplace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WishlistItemResponse {
    private UUID id;
    private String name;
    private BigDecimal price;
    private BigDecimal originalPrice;
    private String image;
    private UUID storeId;
    private String storeName;
    private Boolean isOfficialStore;
}
