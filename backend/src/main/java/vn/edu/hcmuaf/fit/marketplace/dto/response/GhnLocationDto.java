package vn.edu.hcmuaf.fit.marketplace.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Builder
public class GhnLocationDto {
    private String code;
    private String name;

    public GhnLocationDto(String code, String name) {
        this.code = code;
        this.name = name;
    }

    public GhnLocationDto() {
    }

    public static class RawProvince {
        @JsonProperty("ProvinceID")
        private int provinceId;
        @JsonProperty("ProvinceName")
        private String provinceName;
        @JsonProperty("Code")
        private String code;

        public int getProvinceId() {
            return provinceId;
        }

        public void setProvinceId(int provinceId) {
            this.provinceId = provinceId;
        }

        public String getProvinceName() {
            return provinceName;
        }

        public void setProvinceName(String provinceName) {
            this.provinceName = provinceName;
        }

        public String getCode() {
            return code;
        }

        public void setCode(String code) {
            this.code = code;
        }
    }

    public static class RawDistrict {
        @JsonProperty("DistrictID")
        private int districtId;
        @JsonProperty("ProvinceID")
        private int provinceId;
        @JsonProperty("DistrictName")
        private String districtName;
        @JsonProperty("Code")
        private String code;

        public int getDistrictId() {
            return districtId;
        }

        public void setDistrictId(int districtId) {
            this.districtId = districtId;
        }

        public int getProvinceId() {
            return provinceId;
        }

        public void setProvinceId(int provinceId) {
            this.provinceId = provinceId;
        }

        public String getDistrictName() {
            return districtName;
        }

        public void setDistrictName(String districtName) {
            this.districtName = districtName;
        }

        public String getCode() {
            return code;
        }

        public void setCode(String code) {
            this.code = code;
        }
    }

    public static class RawWard {
        @JsonProperty("WardCode")
        private String wardCode;
        @JsonProperty("DistrictID")
        private int districtId;
        @JsonProperty("WardName")
        private String wardName;

        public String getWardCode() {
            return wardCode;
        }

        public void setWardCode(String wardCode) {
            this.wardCode = wardCode;
        }

        public int getDistrictId() {
            return districtId;
        }

        public void setDistrictId(int districtId) {
            this.districtId = districtId;
        }

        public String getWardName() {
            return wardName;
        }

        public void setWardName(String wardName) {
            this.wardName = wardName;
        }
    }
}
