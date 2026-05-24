package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.annotation.JsonProperty;
import vn.edu.hcmuaf.fit.marketplace.config.VNPayProperties;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VNPayCreatePayUrlResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VNPayReturnVerifyResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class VNPayService {

    private static final String VNP_VERSION = "2.1.0";
    private static final String VNP_COMMAND = "pay";
    private static final String VNP_CURR_CODE = "VND";
    private static final String VNP_ORDER_TYPE = "other";
    private static final ZoneId VNP_ZONE_ID = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter VNP_DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final Pattern TXN_REF_PATTERN = Pattern.compile("^(DH-\\d{6}-\\d{6})(\\d{9})$");

    private final VNPayProperties properties;
    private final OrderService orderService;

    public VNPayService(VNPayProperties properties, OrderService orderService) {
        this.properties = properties;
        this.orderService = orderService;
    }

    public VNPayCreatePayUrlResponse createPaymentUrl(Order order, String clientIp) {
        validateConfiguration();
        validatePayableOrder(order);

        LocalDateTime createdAt = LocalDateTime.now(VNP_ZONE_ID);
        LocalDateTime expiresAt = createdAt.plusMinutes(Math.max(properties.getExpireMinutes(), 1));
        String txnRef = generateTxnRef(order.getOrderCode(), createdAt);

        TreeMap<String, String> params = new TreeMap<>();
        params.put("vnp_Version", VNP_VERSION);
        params.put("vnp_Command", VNP_COMMAND);
        params.put("vnp_TmnCode", properties.getTmnCode().trim());
        params.put("vnp_Amount", toVnpAmount(order.getTotal()));
        params.put("vnp_CurrCode", VNP_CURR_CODE);
        params.put("vnp_TxnRef", txnRef);
        params.put("vnp_OrderInfo", "Thanh toan don hang " + order.getOrderCode());
        params.put("vnp_OrderType", VNP_ORDER_TYPE);
        params.put("vnp_Locale", resolveLocale());
        params.put("vnp_ReturnUrl", properties.getReturnUrl().trim());
        params.put("vnp_IpAddr", normalizeIp(clientIp));
        params.put("vnp_CreateDate", VNP_DATE_FORMATTER.format(createdAt));
        params.put("vnp_ExpireDate", VNP_DATE_FORMATTER.format(expiresAt));

        String hashData = buildQueryString(params);
        String secureHash = hmacSha512(properties.getHashSecret().trim(), hashData);
        String paymentUrl = properties.getPayUrl().trim()
                + "?" + hashData
                + "&vnp_SecureHash=" + urlEncode(secureHash);

        return VNPayCreatePayUrlResponse.builder()
                .paymentUrl(paymentUrl)
                .orderCode(order.getOrderCode())
                .txnRef(txnRef)
                .expiresAt(expiresAt)
                .build();
    }

    public VNPayReturnVerifyResponse verifyReturn(Map<String, String> queryParams) {
        validateConfiguration();

        String txnRef = normalize(queryParams.get("vnp_TxnRef"));
        String orderCode = extractOrderCode(txnRef);
        String responseCode = normalize(queryParams.get("vnp_ResponseCode"));
        String transactionStatus = normalize(queryParams.get("vnp_TransactionStatus"));
        BigDecimal gatewayAmount = parseVnpAmount(queryParams.get("vnp_Amount"));
        boolean checksumValid = isChecksumValid(queryParams);

        Order order = findOrderByCodeOrNull(orderCode);
        boolean orderExists = order != null;
        boolean amountMatches = orderExists && gatewayAmount != null && toVnpAmount(order.getTotal()).equals(toVnpAmount(gatewayAmount));
        boolean successTxn = isSuccessTransaction(responseCode, transactionStatus);
        boolean orderPaid = orderExists && order.getPaymentStatus() == Order.PaymentStatus.PAID;

        if (checksumValid && orderExists && amountMatches && successTxn && !orderPaid) {
            orderPaid = tryConfirmPaidFromVerifiedReturn(order);
        }
        if (checksumValid && orderExists && amountMatches && !successTxn && !orderPaid) {
            cancelUnpaidOrder(order, "VNPay payment was not completed");
        }

        String status = "failed";
        String message = resolveVerifyMessage(checksumValid, orderExists, amountMatches, successTxn, responseCode, orderPaid);
        if (checksumValid && orderExists && amountMatches && successTxn) {
            status = orderPaid ? "success" : "pending";
        }

        BigDecimal amountForUi = gatewayAmount != null ? gatewayAmount : (orderExists ? order.getTotal() : BigDecimal.ZERO);

        return VNPayReturnVerifyResponse.builder()
                .status(status)
                .orderCode(orderCode)
                .amount(amountForUi)
                .responseCode(responseCode)
                .transactionStatus(transactionStatus)
                .orderPaid(orderPaid)
                .message(message)
                .build();
    }

    public VNPayIpnResponse processIpn(Map<String, String> queryParams) {
        validateConfiguration();

        try {
            if (!isChecksumValid(queryParams)) {
                return VNPayIpnResponse.invalidChecksum();
            }

            String txnRef = normalize(queryParams.get("vnp_TxnRef"));
            String orderCode = extractOrderCode(txnRef);
            if (!hasText(orderCode)) {
                return VNPayIpnResponse.orderNotFound();
            }

            Order order = findOrderByCodeOrNull(orderCode);
            if (order == null) {
                return VNPayIpnResponse.orderNotFound();
            }

            BigDecimal gatewayAmount = parseVnpAmount(queryParams.get("vnp_Amount"));
            if (gatewayAmount == null || !toVnpAmount(order.getTotal()).equals(toVnpAmount(gatewayAmount))) {
                return VNPayIpnResponse.invalidAmount();
            }

            String responseCode = normalize(queryParams.get("vnp_ResponseCode"));
            String transactionStatus = normalize(queryParams.get("vnp_TransactionStatus"));
            boolean successTxn = isSuccessTransaction(responseCode, transactionStatus);

            if (!successTxn) {
                return VNPayIpnResponse.success();
            }

            if (order.getPaymentStatus() == Order.PaymentStatus.PAID) {
                return VNPayIpnResponse.success();
            }

            if (order.getStatus() == Order.OrderStatus.CANCELLED || order.getStatus() == Order.OrderStatus.DELIVERED) {
                return VNPayIpnResponse.orderAlreadyConfirmed();
            }

            orderService.markOrderPaid(order.getId());
            return VNPayIpnResponse.success();
        } catch (Exception ex) {
            return VNPayIpnResponse.unknownError();
        }
    }

    private void validateConfiguration() {
        if (!properties.isConfigured()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "VNPay sandbox config missing. Please set VNPAY_TMN_CODE, VNPAY_HASH_SECRET, VNPAY_PAY_URL, VNPAY_RETURN_URL in backend/.env"
            );
        }
    }

    private void validatePayableOrder(Order order) {
        if (order == null) {
            throw new ResourceNotFoundException("Order not found");
        }
        if (order.getPaymentMethod() != Order.PaymentMethod.VNPAY) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order payment method is not VNPAY");
        }
        if (order.getPaymentStatus() == Order.PaymentStatus.PAID) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order is already paid");
        }
        if (order.getStatus() == Order.OrderStatus.CANCELLED || order.getStatus() == Order.OrderStatus.DELIVERED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order is not eligible for VNPay payment");
        }
        if (order.getTotal() == null || order.getTotal().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order total must be greater than 0");
        }
    }

    private String generateTxnRef(String orderCode, LocalDateTime createdAt) {
        return orderCode + createdAt.format(DateTimeFormatter.ofPattern("HHmmssSSS"));
    }

    private String extractOrderCode(String txnRef) {
        if (!hasText(txnRef)) {
            return null;
        }
        Matcher matcher = TXN_REF_PATTERN.matcher(txnRef.trim());
        if (matcher.matches()) {
            return matcher.group(1);
        }
        return txnRef.trim();
    }

    private boolean isSuccessTransaction(String responseCode, String transactionStatus) {
        return "00".equals(responseCode) && "00".equals(transactionStatus);
    }

    private boolean tryConfirmPaidFromVerifiedReturn(Order order) {
        if (order == null) {
            return false;
        }
        if (order.getPaymentStatus() == Order.PaymentStatus.PAID) {
            return true;
        }
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
        if (order == null) {
            return;
        }
        try {
            orderService.cancelUnpaidOnlinePaymentOrder(order.getId(), reason);
        } catch (Exception ignored) {
            // Verification should still return the gateway result even if cancellation sync fails.
        }
    }

    private String resolveVerifyMessage(
            boolean checksumValid,
            boolean orderExists,
            boolean amountMatches,
            boolean successTxn,
            String responseCode,
            boolean orderPaid
    ) {
        if (!checksumValid) {
            return "Chu ky giao dich khong hop le";
        }
        if (!orderExists) {
            return "Khong tim thay don hang";
        }
        if (!amountMatches) {
            return "So tien giao dich khong khop voi don hang";
        }
        if (successTxn && orderPaid) {
            return "Thanh toan thanh cong";
        }
        if (successTxn) {
            return "Giao dich thanh cong, dang cho xac nhan IPN";
        }
        if ("24".equals(responseCode)) {
            return "Giao dich da bi huy boi nguoi dung";
        }
        return "Thanh toan that bai";
    }

    private boolean isChecksumValid(Map<String, String> params) {
        String secureHash = normalize(params.get("vnp_SecureHash"));
        if (!hasText(secureHash)) {
            return false;
        }

        TreeMap<String, String> hashFields = new TreeMap<>();
        params.forEach((key, value) -> {
            if (!hasText(key) || !key.startsWith("vnp_")) {
                return;
            }
            if ("vnp_SecureHash".equals(key) || "vnp_SecureHashType".equals(key)) {
                return;
            }
            if (!hasText(value)) {
                return;
            }
            hashFields.put(key, value);
        });

        String hashData = buildQueryString(hashFields);
        String expected = hmacSha512(properties.getHashSecret().trim(), hashData);
        return expected.equalsIgnoreCase(secureHash);
    }

    private String buildQueryString(Map<String, String> params) {
        return params.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + urlEncode(entry.getValue()))
                .collect(Collectors.joining("&"));
    }

    private String hmacSha512(String secret, String data) {
        try {
            Mac hmac512 = Mac.getInstance("HmacSHA512");
            SecretKeySpec secretKeySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA512");
            hmac512.init(secretKeySpec);
            byte[] bytes = hmac512.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hash = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                hash.append(String.format("%02x", b));
            }
            return hash.toString();
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Cannot sign VNPay request", ex);
        }
    }

    private String toVnpAmount(BigDecimal amount) {
        if (amount == null) {
            return "0";
        }
        BigDecimal normalized = amount.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP);
        return normalized.toPlainString();
    }

    private BigDecimal parseVnpAmount(String rawAmount) {
        if (!hasText(rawAmount)) {
            return null;
        }
        try {
            return new BigDecimal(rawAmount.trim()).movePointLeft(2).setScale(2, RoundingMode.HALF_UP);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private String resolveLocale() {
        String locale = normalize(properties.getLocale());
        return hasText(locale) ? locale : "vn";
    }

    private String normalizeIp(String ip) {
        String normalized = normalize(ip);
        return hasText(normalized) ? normalized : "127.0.0.1";
    }

    private String normalize(String value) {
        return value == null ? null : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private Order findOrderByCodeOrNull(String orderCode) {
        if (!hasText(orderCode)) {
            return null;
        }
        try {
            return orderService.findByCode(orderCode);
        } catch (ResourceNotFoundException ex) {
            return null;
        }
    }

    public record VNPayIpnResponse(
            @JsonProperty("RspCode") String rspCode,
            @JsonProperty("Message") String message
    ) {
        static VNPayIpnResponse success() {
            return new VNPayIpnResponse("00", "Confirm Success");
        }

        static VNPayIpnResponse orderNotFound() {
            return new VNPayIpnResponse("01", "Order not found");
        }

        static VNPayIpnResponse orderAlreadyConfirmed() {
            return new VNPayIpnResponse("02", "Order already confirmed");
        }

        static VNPayIpnResponse invalidAmount() {
            return new VNPayIpnResponse("04", "Invalid amount");
        }

        static VNPayIpnResponse invalidChecksum() {
            return new VNPayIpnResponse("97", "Invalid checksum");
        }

        static VNPayIpnResponse unknownError() {
            return new VNPayIpnResponse("99", "Unknown error");
        }
    }
}
