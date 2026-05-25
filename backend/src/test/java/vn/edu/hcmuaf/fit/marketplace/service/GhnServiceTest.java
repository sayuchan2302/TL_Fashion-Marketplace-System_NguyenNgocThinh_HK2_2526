package vn.edu.hcmuaf.fit.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import vn.edu.hcmuaf.fit.marketplace.config.GhnProperties;
import vn.edu.hcmuaf.fit.marketplace.dto.response.GhnLocationDto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class GhnServiceTest {

    private GhnProperties properties;
    private MockRestTemplate restTemplate;
    private GhnService ghnService;

    private static class MockRestTemplate extends RestTemplate {
        String lastUrl;
        HttpEntity<?> lastEntity;
        Object nextResponse;
        boolean shouldThrow;

        @Override
        @SuppressWarnings("unchecked")
        public <T> ResponseEntity<T> postForEntity(String url, Object request, Class<T> responseType,
                Object... uriVariables) {
            this.lastUrl = url;
            this.lastEntity = (HttpEntity<?>) request;
            if (shouldThrow) {
                throw new RestClientException("Connection failed mock");
            }
            return ResponseEntity.ok((T) nextResponse);
        }
    }

    @BeforeEach
    public void setUp() {
        properties = new GhnProperties();
        properties.setApiUrl("https://dev-online-gateway.ghn.vn/shiip/public-api");
        properties.setToken("test-token");
        properties.setDefaultFromDistrictId(1450);

        restTemplate = new MockRestTemplate();
        ghnService = new GhnService(properties, restTemplate);
    }

    @Test
    public void testGetProvincesCache() {
        GhnService.ProvinceResponse response = new GhnService.ProvinceResponse();
        response.setCode(200);
        GhnLocationDto.RawProvince province = new GhnLocationDto.RawProvince();
        province.setProvinceId(201);
        province.setProvinceName("Hồ Chí Minh");
        response.setData(List.of(province));

        restTemplate.nextResponse = response;

        // First call
        List<GhnLocationDto.RawProvince> firstCall = ghnService.getProvinces();
        assertNotNull(firstCall);
        assertEquals(1, firstCall.size());
        assertEquals("Hồ Chí Minh", firstCall.get(0).getProvinceName());
        assertEquals("https://dev-online-gateway.ghn.vn/shiip/public-api/master-data/province", restTemplate.lastUrl);

        // Reset last URL to check cache
        restTemplate.lastUrl = null;

        // Second call (should be served from cache)
        List<GhnLocationDto.RawProvince> secondCall = ghnService.getProvinces();
        assertSame(firstCall, secondCall);
        assertNull(restTemplate.lastUrl); // Not called again!
    }

    @Test
    public void testCalculateShippingFeeSuccess() {
        GhnService.FeeResponse feeResponse = new GhnService.FeeResponse();
        feeResponse.setCode(200);
        GhnService.FeeData feeData = new GhnService.FeeData();
        feeData.setTotal(25000);
        feeResponse.setData(feeData);

        restTemplate.nextResponse = feeResponse;

        BigDecimal fee = ghnService.calculateShippingFee(1450, 1452, "20109", 500, new BigDecimal("100000"));
        assertNotNull(fee);
        assertEquals(new BigDecimal("25000"), fee);
        assertEquals("https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee", restTemplate.lastUrl);

        HttpEntity<?> capturedEntity = restTemplate.lastEntity;
        assertNotNull(capturedEntity);
        Map<?, ?> body = (Map<?, ?>) capturedEntity.getBody();
        assertNotNull(body);
        assertEquals(1450, body.get("from_district_id"));
        assertEquals(1452, body.get("to_district_id"));
        assertEquals("20109", body.get("to_ward_code"));
        assertEquals(500, body.get("weight"));
        assertEquals(100000, ((Number) body.get("insurance_value")).intValue()); // capped/parsed nicely
    }

    @Test
    public void testCalculateShippingFeeFallbackOnException() {
        restTemplate.shouldThrow = true;

        BigDecimal fee = ghnService.calculateShippingFee(1450, 1452, "20109", 500, new BigDecimal("100000"));
        assertNull(fee); // returns null to signal dynamic fee lookup failure and activate default
                         // fallback gracefully
    }
}
