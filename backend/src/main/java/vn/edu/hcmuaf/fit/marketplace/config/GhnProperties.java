package vn.edu.hcmuaf.fit.marketplace.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "ghn")
public class GhnProperties {
    private String apiUrl = "https://dev-online-gateway.ghn.vn/shiip/public-api";
    private String token = "";
    private Integer defaultFromDistrictId = 1450;
}
