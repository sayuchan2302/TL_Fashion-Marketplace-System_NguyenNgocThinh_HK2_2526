package vn.edu.hcmuaf.fit.marketplace.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import vn.edu.hcmuaf.fit.marketplace.dto.response.GhnLocationDto;
import vn.edu.hcmuaf.fit.marketplace.service.GhnService;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/shipping/ghn")
public class GhnController {

    private final GhnService ghnService;

    @Autowired
    private vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository storeRepository;

    @Autowired
    public GhnController(GhnService ghnService) {
        this.ghnService = ghnService;
    }

    @GetMapping("/provinces")
    public ResponseEntity<List<GhnLocationDto>> getProvinces() {
        List<GhnLocationDto> provinces = ghnService.getProvinces().stream()
                .map(p -> new GhnLocationDto(String.valueOf(p.getProvinceId()), p.getProvinceName()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(provinces);
    }

    @GetMapping("/districts")
    public ResponseEntity<List<GhnLocationDto>> getDistricts(@RequestParam("provinceId") int provinceId) {
        List<GhnLocationDto> districts = ghnService.getDistricts(provinceId).stream()
                .map(d -> new GhnLocationDto(String.valueOf(d.getDistrictId()), d.getDistrictName()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(districts);
    }

    @GetMapping("/wards")
    public ResponseEntity<List<GhnLocationDto>> getWards(@RequestParam("districtId") int districtId) {
        List<GhnLocationDto> wards = ghnService.getWards(districtId).stream()
                .map(w -> new GhnLocationDto(w.getWardCode(), w.getWardName()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(wards);
    }

    @PostMapping("/calculate-fee")
    public ResponseEntity<Map<String, Object>> calculateFee(@RequestBody Map<String, Object> request) {
        int fromDistrictId = (int) request.getOrDefault("fromDistrictId", 1450);

        if (request.containsKey("storeId") && request.get("storeId") != null) {
            try {
                java.util.UUID storeId = java.util.UUID.fromString(request.get("storeId").toString());
                vn.edu.hcmuaf.fit.marketplace.entity.Store store = storeRepository.findById(storeId).orElse(null);
                if (store != null && store.getGhnDistrictId() != null) {
                    fromDistrictId = store.getGhnDistrictId();
                }
            } catch (Exception e) {
                // Ignore and use default or provided fromDistrictId fallback
            }
        }

        int toDistrictId = ((Number) request.get("toDistrictId")).intValue();
        String toWardCode = (String) request.get("toWardCode");
        int weight = ((Number) request.getOrDefault("weight", 500)).intValue();

        BigDecimal insuranceValue = null;
        if (request.containsKey("insuranceValue") && request.get("insuranceValue") != null) {
            insuranceValue = new BigDecimal(request.get("insuranceValue").toString());
        }

        BigDecimal fee = ghnService.calculateShippingFee(fromDistrictId, toDistrictId, toWardCode, weight,
                insuranceValue);
        if (fee == null) {
            // Fallback fee response when GHN service fails or throws exceptions
            return ResponseEntity.ok(Map.of(
                    "fee", 30000,
                    "isFallback", true,
                    "message", "Failed to calculate via GHN. Handed over generic fallback shipping rate."));
        }

        return ResponseEntity.ok(Map.of(
                "fee", fee,
                "isFallback", false));
    }
}
