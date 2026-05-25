package vn.edu.hcmuaf.fit.marketplace.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import vn.edu.hcmuaf.fit.marketplace.config.GhnProperties;
import vn.edu.hcmuaf.fit.marketplace.dto.response.GhnLocationDto;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GhnService {
    private static final Logger logger = LoggerFactory.getLogger(GhnService.class);

    private final GhnProperties properties;
    private final RestTemplate restTemplate;

    // Cache to prevent hitting GHN API limits and keep checkout extremely fast
    private final List<GhnLocationDto.RawProvince> provinceCache = new ArrayList<>();
    private final Map<Integer, List<GhnLocationDto.RawDistrict>> districtCache = new ConcurrentHashMap<>();
    private final Map<Integer, List<GhnLocationDto.RawWard>> wardCache = new ConcurrentHashMap<>();

    @Autowired
    public GhnService(GhnProperties properties) {
        this.properties = properties;
        this.restTemplate = new RestTemplate();
    }

    // Constructor for testing with mocked RestTemplate
    public GhnService(GhnProperties properties, RestTemplate restTemplate) {
        this.properties = properties;
        this.restTemplate = restTemplate;
    }

    public Integer getDefaultFromDistrictId() {
        return properties != null ? properties.getDefaultFromDistrictId() : 1450;
    }

    public List<GhnLocationDto.RawProvince> getProvinces() {
        if (!provinceCache.isEmpty()) {
            return provinceCache;
        }

        synchronized (provinceCache) {
            if (!provinceCache.isEmpty()) {
                return provinceCache;
            }

            try {
                String url = properties.getApiUrl() + "/master-data/province";
                HttpHeaders headers = createHeaders();
                HttpEntity<String> entity = new HttpEntity<>("{}", headers);

                ResponseEntity<ProvinceResponse> responseEntity = restTemplate.postForEntity(url, entity,
                        ProvinceResponse.class);
                ProvinceResponse body = responseEntity.getBody();

                if (body != null && body.getData() != null) {
                    provinceCache.addAll(body.getData());
                    logger.info("Successfully fetched and cached {} provinces from GHN", provinceCache.size());
                }
            } catch (Exception e) {
                logger.error("Error fetching provinces from GHN: {}", e.getMessage(), e);
            }
            return provinceCache;
        }
    }

    public List<GhnLocationDto.RawDistrict> getDistricts(int provinceId) {
        return districtCache.computeIfAbsent(provinceId, id -> {
            List<GhnLocationDto.RawDistrict> districts = new ArrayList<>();
            try {
                String url = properties.getApiUrl() + "/master-data/district";
                HttpHeaders headers = createHeaders();
                Map<String, Object> bodyMap = new HashMap<>();
                bodyMap.put("province_id", id);
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(bodyMap, headers);

                ResponseEntity<DistrictResponse> responseEntity = restTemplate.postForEntity(url, entity,
                        DistrictResponse.class);
                DistrictResponse body = responseEntity.getBody();

                if (body != null && body.getData() != null) {
                    districts.addAll(body.getData());
                    logger.info("Successfully fetched and cached {} districts for province {} from GHN",
                            districts.size(), id);
                }
            } catch (Exception e) {
                logger.error("Error fetching districts for province {} from GHN: {}", id, e.getMessage(), e);
            }
            return districts;
        });
    }

    public List<GhnLocationDto.RawWard> getWards(int districtId) {
        return wardCache.computeIfAbsent(districtId, id -> {
            List<GhnLocationDto.RawWard> wards = new ArrayList<>();
            try {
                String url = properties.getApiUrl() + "/master-data/ward";
                HttpHeaders headers = createHeaders();
                Map<String, Object> bodyMap = new HashMap<>();
                bodyMap.put("district_id", id);
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(bodyMap, headers);

                ResponseEntity<WardResponse> responseEntity = restTemplate.postForEntity(url, entity,
                        WardResponse.class);
                WardResponse body = responseEntity.getBody();

                if (body != null && body.getData() != null) {
                    wards.addAll(body.getData());
                    logger.info("Successfully fetched and cached {} wards for district {} from GHN", wards.size(), id);
                }
            } catch (Exception e) {
                logger.error("Error fetching wards for district {} from GHN: {}", id, e.getMessage(), e);
            }
            return wards;
        });
    }

    public BigDecimal calculateShippingFee(int fromDistrictId, int toDistrictId, String toWardCode, int weightGram,
            BigDecimal insuranceVal) {
        try {
            String url = properties.getApiUrl() + "/v2/shipping-order/fee";
            HttpHeaders headers = createHeaders();

            // GHN specific request body parameters for shipping fee estimation
            Map<String, Object> bodyMap = new HashMap<>();
            bodyMap.put("from_district_id", fromDistrictId);
            bodyMap.put("to_district_id", toDistrictId);
            bodyMap.put("to_ward_code", toWardCode);
            bodyMap.put("service_type_id", 2); // 2: Standard service
            bodyMap.put("weight", weightGram <= 0 ? 500 : weightGram); // default 500g
            bodyMap.put("height", 10);
            bodyMap.put("length", 10);
            bodyMap.put("width", 10);

            // Capped insurance up to 5,000,000 VND
            if (insuranceVal != null) {
                int insuranceValInt = insuranceVal.intValue();
                bodyMap.put("insurance_value", Math.min(5000000, Math.max(0, insuranceValInt)));
            } else {
                bodyMap.put("insurance_value", 0);
            }

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(bodyMap, headers);
            ResponseEntity<FeeResponse> responseEntity = restTemplate.postForEntity(url, entity, FeeResponse.class);
            FeeResponse response = responseEntity.getBody();

            if (response != null && response.getData() != null) {
                BigDecimal totalFee = new BigDecimal(response.getData().getTotal());
                logger.info("GHN dynamic shipping calculated fee: {} VND (from District {} to {}/Ward {})",
                        totalFee, fromDistrictId, toDistrictId, toWardCode);
                return totalFee;
            }
        } catch (Exception e) {
            logger.error("GHN Shipping fee estimation failed (from {} to {}/Ward {}): {}. Falling back to default fee.",
                    fromDistrictId, toDistrictId, toWardCode, e.getMessage());
        }
        return null; // Return null so the service triggers a standard fallback fee gracefully
    }

    private HttpHeaders createHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Token", properties.getToken());
        return headers;
    }

    // GHN Generic Response classes
    public static class ProvinceResponse {
        private int code;
        private String message;
        private List<GhnLocationDto.RawProvince> data;

        public int getCode() {
            return code;
        }

        public void setCode(int code) {
            this.code = code;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public List<GhnLocationDto.RawProvince> getData() {
            return data;
        }

        public void setData(List<GhnLocationDto.RawProvince> data) {
            this.data = data;
        }
    }

    public static class DistrictResponse {
        private int code;
        private String message;
        private List<GhnLocationDto.RawDistrict> data;

        public int getCode() {
            return code;
        }

        public void setCode(int code) {
            this.code = code;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public List<GhnLocationDto.RawDistrict> getData() {
            return data;
        }

        public void setData(List<GhnLocationDto.RawDistrict> data) {
            this.data = data;
        }
    }

    public static class WardResponse {
        private int code;
        private String message;
        private List<GhnLocationDto.RawWard> data;

        public int getCode() {
            return code;
        }

        public void setCode(int code) {
            this.code = code;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public List<GhnLocationDto.RawWard> getData() {
            return data;
        }

        public void setData(List<GhnLocationDto.RawWard> data) {
            this.data = data;
        }
    }

    public static class FeeResponse {
        private int code;
        private String message;
        private FeeData data;

        public int getCode() {
            return code;
        }

        public void setCode(int code) {
            this.code = code;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public FeeData getData() {
            return data;
        }

        public void setData(FeeData data) {
            this.data = data;
        }
    }

    public static class FeeData {
        private int total;
        private int service_fee;
        private int insurance_fee;

        public int getTotal() {
            return total;
        }

        public void setTotal(int total) {
            this.total = total;
        }

        public int getService_fee() {
            return service_fee;
        }

        public void setService_fee(int service_fee) {
            this.service_fee = service_fee;
        }

        public int getInsurance_fee() {
            return insurance_fee;
        }

        public void setInsurance_fee(int insurance_fee) {
            this.insurance_fee = insurance_fee;
        }
    }
}
