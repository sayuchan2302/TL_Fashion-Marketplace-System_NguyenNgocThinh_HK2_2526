package vn.edu.hcmuaf.fit.marketplace.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.config.MoMoProperties;
import vn.edu.hcmuaf.fit.marketplace.dto.response.MoMoCreatePayUrlResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.MoMoReturnVerifyResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class MoMoService {

    private final MoMoProperties properties;
    private final OrderService orderService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public MoMoService(MoMoProperties properties, OrderService orderService, ObjectMapper objectMapper) {
        this.properties = properties;
        this.orderService = orderService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();
    }

    public MoMoCreatePayUrlResponse createPaymentUrl(Order order, String clientIp) {
        validateConfigurationForCreate();
        validatePayableOrder(order);

        String orderCode = order.getOrderCode();
        String requestId = orderCode + "-" + System.currentTimeMillis();
        String amount = toMomoAmount(order.getTotal());
        String redirectUrl = appendQueryParam(properties.getReturnUrl().trim(), "gateway", "momo");
        String ipnUrl = resolveIpnUrl(redirectUrl);
        String orderInfo = "Thanh toan don hang " + orderCode;
        String extraData = "e30=";
        String requestType = normalize(properties.getRequestType(), "captureWallet");
        String lang = normalize(properties.getLang(), "en");

        String rawData = buildRawCreateSignature(amount, ipnUrl, orderCode, orderInfo, redirectUrl, requestId, extraData, requestType);
        String signature = signHmacSha256(rawData, properties.getSecretKey().trim());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("partnerCode", properties.getPartnerCode().trim());
        payload.put("accessKey", properties.getAccessKey().trim());
        payload.put("requestId", requestId);
        payload.put("amount", amount);
        payload.put("orderId", orderCode);
        payload.put("orderInfo", orderInfo);
        payload.put("redirectUrl", redirectUrl);
        payload.put("ipnUrl", ipnUrl);
        payload.put("extraData", extraData);
        payload.put("requestType", requestType);
        payload.put("lang", lang);
        payload.put("autoCapture", properties.isAutoCapture());
        payload.put("signature", signature);

        JsonNode response = postJson(properties.getCreateUrl().trim(), payload);
        int resultCode = response.path("resultCode").asInt(-1);
        String message = readText(response, "message");
        if (resultCode != 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    hasText(message) ? message : ("MoMo create payment failed, resultCode=" + resultCode)
            );
        }

        String paymentUrl = firstNonBlank(
                readText(response, "payUrl"),
                readText(response, "shortLink"),
                readText(response, "deeplink"),
                readText(response, "qrCodeUrl")
        );
        if (!hasText(paymentUrl)) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "MoMo did not return payment URL");
        }

        return MoMoCreatePayUrlResponse.builder()
                .paymentUrl(paymentUrl)
                .orderCode(orderCode)
                .requestId(readText(response, "requestId"))
                .deeplink(readText(response, "deeplink"))
                .qrCodeUrl(readText(response, "qrCodeUrl"))
                .build();
    }

    public MoMoReturnVerifyResponse verifyReturn(Map<String, String> queryParams) {
        String orderCode = normalize(queryParams.get("orderId"), null);
        String message = normalize(queryParams.get("message"), null);
        String resultCodeFromReturn = normalize(queryParams.get("resultCode"), null);
        int effectiveResultCode = parseInt(resultCodeFromReturn, -1);
        BigDecimal amount = parseAmount(queryParams.get("amount"));

        QueryResult queryResult = null;
        if (hasText(orderCode) && properties.isConfiguredForQuery()) {
            queryResult = queryTransactionStatus(orderCode);
            if (queryResult != null) {
                effectiveResultCode = queryResult.resultCode();
                if (queryResult.amount() != null) {
                    amount = queryResult.amount();
                }
                if (hasText(queryResult.message())) {
                    message = queryResult.message();
                }
            }
        }

        Order order = findOrderByCodeOrNull(orderCode);
        boolean orderExists = order != null;
        boolean successTxn = effectiveResultCode == 0;
        boolean orderPaid = orderExists && order.getPaymentStatus() == Order.PaymentStatus.PAID;

        if (successTxn && orderExists && !orderPaid) {
            orderPaid = tryMarkPaid(order);
        }
        if (orderExists && !successTxn && !orderPaid) {
            cancelUnpaidOrder(order, "MoMo payment was not completed");
        }

        String status = "failed";
        if (successTxn && orderExists && orderPaid) {
            status = "success";
        } else if (successTxn && orderExists) {
            status = "pending";
        }

        if (!hasText(message)) {
            message = resolveVerifyMessage(orderExists, successTxn, orderPaid, effectiveResultCode);
        }

        if (amount == null && orderExists) {
            amount = order.getTotal();
        }

        return MoMoReturnVerifyResponse.builder()
                .status(status)
                .orderCode(orderCode)
                .amount(amount)
                .resultCode(String.valueOf(effectiveResultCode))
                .orderPaid(orderPaid)
                .message(message)
                .build();
    }

    public MoMoIpnResponse processIpn(Map<String, Object> payload) {
        String orderCode = normalize(asString(payload.get("orderId")), null);
        int resultCode = parseInt(asString(payload.get("resultCode")), -1);
        if (!hasText(orderCode)) {
            return MoMoIpnResponse.badRequest("Missing orderId");
        }

        if (resultCode != 0) {
            return MoMoIpnResponse.success("Ignored non-success transaction");
        }

        Order order = findOrderByCodeOrNull(orderCode);
        if (order == null) {
            return MoMoIpnResponse.badRequest("Order not found");
        }

        if (order.getPaymentStatus() == Order.PaymentStatus.PAID) {
            return MoMoIpnResponse.success("Order already paid");
        }

        if (order.getStatus() == Order.OrderStatus.CANCELLED || order.getStatus() == Order.OrderStatus.DELIVERED) {
            return MoMoIpnResponse.badRequest("Order is not eligible for payment update");
        }

        try {
            orderService.markOrderPaid(order.getId());
            return MoMoIpnResponse.success("Confirm Success");
        } catch (Exception ex) {
            return MoMoIpnResponse.unknownError();
        }
    }

    private QueryResult queryTransactionStatus(String orderCode) {
        String requestId = "momo-query-" + System.currentTimeMillis();
        String rawData = "accessKey=" + properties.getAccessKey().trim()
                + "&orderId=" + orderCode
                + "&partnerCode=" + properties.getPartnerCode().trim()
                + "&requestId=" + requestId;
        String signature = signHmacSha256(rawData, properties.getSecretKey().trim());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("partnerCode", properties.getPartnerCode().trim());
        payload.put("requestId", requestId);
        payload.put("orderId", orderCode);
        payload.put("lang", normalize(properties.getLang(), "en"));
        payload.put("signature", signature);

        JsonNode response = postJson(properties.getQueryUrl().trim(), payload);
        int resultCode = response.path("resultCode").asInt(-1);
        BigDecimal amount = parseAmount(readText(response, "amount"));
        String message = readText(response, "message");
        return new QueryResult(resultCode, amount, message);
    }

    private JsonNode postJson(String url, Map<String, Object> payload) {
        try {
            String body = objectMapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(12))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            String responseBody = response.body();
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String gatewayMessage = extractGatewayMessage(responseBody);
                String errorMessage = "MoMo gateway HTTP " + response.statusCode();
                if (hasText(gatewayMessage)) {
                    errorMessage += " - " + gatewayMessage;
                }
                HttpStatus status = response.statusCode() >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST;
                throw new ResponseStatusException(status, errorMessage);
            }
            return objectMapper.readTree(responseBody);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Cannot call MoMo gateway", ex);
        }
    }

    private String extractGatewayMessage(String responseBody) {
        if (!hasText(responseBody)) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(responseBody);
            String resultCode = readText(node, "resultCode");
            String message = readText(node, "message");
            if (hasText(resultCode) && hasText(message)) {
                return "resultCode=" + resultCode + ", message=" + message;
            }
            if (hasText(message)) {
                return message;
            }
            if (hasText(resultCode)) {
                return "resultCode=" + resultCode;
            }
        } catch (Exception ignored) {
            // return fallback plain text below
        }
        return responseBody.trim();
    }

    private String buildRawCreateSignature(
            String amount,
            String ipnUrl,
            String orderId,
            String orderInfo,
            String redirectUrl,
            String requestId,
            String extraData,
            String requestType
    ) {
        return "accessKey=" + properties.getAccessKey().trim()
                + "&amount=" + amount
                + "&extraData=" + extraData
                + "&ipnUrl=" + ipnUrl
                + "&orderId=" + orderId
                + "&orderInfo=" + orderInfo
                + "&partnerCode=" + properties.getPartnerCode().trim()
                + "&redirectUrl=" + redirectUrl
                + "&requestId=" + requestId
                + "&requestType=" + requestType;
    }

    private String signHmacSha256(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] bytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Cannot sign MoMo request", ex);
        }
    }

    private void validateConfigurationForCreate() {
        if (!properties.isConfiguredForCreate()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "MoMo config missing. Please set MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY, MOMO_CREATE_URL, MOMO_RETURN_URL"
            );
        }
    }

    private void validatePayableOrder(Order order) {
        if (order == null) {
            throw new ResourceNotFoundException("Order not found");
        }
        if (order.getPaymentMethod() != Order.PaymentMethod.MOMO) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order payment method is not MOMO");
        }
        if (order.getPaymentStatus() == Order.PaymentStatus.PAID) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order is already paid");
        }
        if (order.getStatus() == Order.OrderStatus.CANCELLED || order.getStatus() == Order.OrderStatus.DELIVERED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order is not eligible for MoMo payment");
        }
        if (order.getTotal() == null || order.getTotal().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order total must be greater than 0");
        }
    }

    private boolean tryMarkPaid(Order order) {
        if (order == null) return false;
        if (order.getPaymentStatus() == Order.PaymentStatus.PAID) return true;
        if (order.getStatus() == Order.OrderStatus.CANCELLED || order.getStatus() == Order.OrderStatus.DELIVERED) {
            return false;
        }
        try {
            orderService.markOrderPaid(order.getId());
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    private void cancelUnpaidOrder(Order order, String reason) {
        if (order == null) return;
        try {
            orderService.cancelUnpaidOnlinePaymentOrder(order.getId(), reason);
        } catch (Exception ignored) {
            // Keep return verification responsive even if cancellation sync fails.
        }
    }

    private String toMomoAmount(BigDecimal amount) {
        if (amount == null) return "0";
        return amount.setScale(0, RoundingMode.HALF_UP).toPlainString();
    }

    private String resolveIpnUrl(String redirectUrl) {
        String configured = properties.resolveIpnUrl();
        if (hasText(configured)) {
            return configured;
        }
        return redirectUrl;
    }

    private String appendQueryParam(String url, String key, String value) {
        if (!hasText(url)) return url;
        String delimiter = url.contains("?") ? "&" : "?";
        return url + delimiter + urlEncode(key) + "=" + urlEncode(value);
    }

    private String resolveVerifyMessage(boolean orderExists, boolean successTxn, boolean orderPaid, int resultCode) {
        if (!orderExists) {
            return "Khong tim thay don hang";
        }
        if (successTxn && orderPaid) {
            return "Thanh toan thanh cong";
        }
        if (successTxn) {
            return "Giao dich thanh cong, dang cho xac nhan";
        }
        if (resultCode == 1006 || resultCode == 1003) {
            return "Giao dich da bi huy boi nguoi dung";
        }
        return "Thanh toan that bai";
    }

    private String readText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        String text = value.asText();
        return hasText(text) ? text.trim() : null;
    }

    private BigDecimal parseAmount(String rawAmount) {
        if (!hasText(rawAmount)) return null;
        try {
            return new BigDecimal(rawAmount.trim()).setScale(2, RoundingMode.HALF_UP);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private int parseInt(String raw, int fallback) {
        if (!hasText(raw)) return fallback;
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private String normalize(String value, String fallback) {
        if (!hasText(value)) return fallback;
        return value.trim();
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (hasText(value)) return value.trim();
        }
        return null;
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private Order findOrderByCodeOrNull(String orderCode) {
        if (!hasText(orderCode)) return null;
        try {
            return orderService.findByCode(orderCode);
        } catch (ResourceNotFoundException ex) {
            return null;
        }
    }

    private record QueryResult(int resultCode, BigDecimal amount, String message) {
    }

    public record MoMoIpnResponse(
            @JsonProperty("resultCode") int resultCode,
            @JsonProperty("message") String message
    ) {
        static MoMoIpnResponse success(String message) {
            return new MoMoIpnResponse(0, hasTextStatic(message) ? message : "Success");
        }

        static MoMoIpnResponse badRequest(String message) {
            return new MoMoIpnResponse(1, hasTextStatic(message) ? message : "Bad request");
        }

        static MoMoIpnResponse unknownError() {
            return new MoMoIpnResponse(99, "Unknown error");
        }

        private static boolean hasTextStatic(String value) {
            return value != null && !value.trim().isEmpty();
        }
    }
}
