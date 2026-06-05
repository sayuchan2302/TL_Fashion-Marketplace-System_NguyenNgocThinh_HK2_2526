package vn.edu.hcmuaf.fit.marketplace.chatbot.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;
import vn.edu.hcmuaf.fit.marketplace.service.OrderService;

import java.util.Locale;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class CustomerSupportChatServiceImpl implements CustomerSupportChatService {

    private final OrderService orderService;
    private final FaqContentLookupService faqContentLookupService;

    public CustomerSupportChatServiceImpl(OrderService orderService, FaqContentLookupService faqContentLookupService) {
        this.orderService = orderService;
        this.faqContentLookupService = faqContentLookupService;
    }

    @Override
    public OrderLookupResult lookupOrderStatus(String orderCode, String phoneLast4) {
        String normalizedCode = orderCode == null ? "" : orderCode.trim().toUpperCase(Locale.ROOT);
        String normalizedPhone4 = normalizeLast4(phoneLast4);

        if (normalizedCode.isBlank()) {
            return new OrderLookupResult(false, "Bạn hãy nhập mã đơn hàng.");
        }
        if (normalizedPhone4.length() != 4) {
            return new OrderLookupResult(false, "4 số cuối số điện thoại chưa hợp lệ.");
        }

        try {
            Order order = orderService.findByCode(normalizedCode);
            String shippingPhone = order.getShippingAddress() == null ? null : order.getShippingAddress().getPhone();
            String shippingDigits = digitsOnly(shippingPhone);

            if (shippingDigits.length() < 4 || !shippingDigits.endsWith(normalizedPhone4)) {
                return new OrderLookupResult(
                        false,
                        "Không xác minh được đơn hàng. Vui lòng kiểm tra lại mã đơn hoặc 4 số cuối SDT.");
            }

            String statusLabel = switch (order.getStatus()) {
                case PENDING -> "Đơn mới tạo";
                case WAITING_FOR_VENDOR -> "Đang chờ shop xác nhận";
                case CONFIRMED -> "Shop đã xác nhận đơn";
                case PROCESSING -> "Đơn đang được chuẩn bị";
                case SHIPPED -> "Đơn đang giao";
                case DELIVERED -> "Đơn đã giao thành công";
                case CANCELLED -> "Đơn đã hủy";
                case RETURNING -> "Đơn đang yêu cầu hoàn trả";
                case COMPLETED -> "Đơn hàng đã hoàn thành";
            };

            String paymentLabel = order.getPaymentStatus() == null
                    ? "Không xác định"
                    : order.getPaymentStatus().name();

            return new OrderLookupResult(
                    true,
                    "Đơn " + order.getOrderCode() + " hiện ở trạng thái: " + statusLabel + ". Thanh toán: "
                            + paymentLabel + ".");
        } catch (ResourceNotFoundException ex) {
            return new OrderLookupResult(false, "Không tìm thấy đơn hàng. Bạn kiểm tra lại mã đơn giúp mình nhé.");
        }
    }

    @Override
    public SizeAdviceResult recommendSize(int heightCm, int weightKg) {
        String suggestedSize;
        if (heightCm < 160 || weightKg < 52) {
            suggestedSize = "S";
        } else if (heightCm < 168 || weightKg < 60) {
            suggestedSize = "M";
        } else if (heightCm < 176 || weightKg < 70) {
            suggestedSize = "L";
        } else if (heightCm < 184 || weightKg < 80) {
            suggestedSize = "XL";
        } else {
            suggestedSize = "XXL";
        }

        return new SizeAdviceResult(
                suggestedSize,
                "Với chiều cao " + heightCm + "cm và cân nặng " + weightKg + "kg, size gợi ý là "
                        + suggestedSize + ". Bạn nên ưu tiên bảng size theo từng sản phẩm để chính xác hơn.");
    }

    @Override
    public String answerProductFaq(String rawQuestion) {
        Optional<String> configuredAnswer = faqContentLookupService.findAnswerByKeyword(rawQuestion);
        if (configuredAnswer.isPresent()) {
            return configuredAnswer.get();
        }

        String question = rawQuestion == null ? "" : rawQuestion.toLowerCase(Locale.ROOT);
        if (question.contains("doi tra") || question.contains("doi hang") || question.contains("tra hang")) {
            return "Bạn có thể gửi yêu cầu đổi/trả trong trang Đơn hàng của tôi theo đúng chính sách hiện hành.";
        }
        if (question.contains("giao hang") || question.contains("ship")) {
            return "Thời gian giao hàng tùy khu vực, thường từ 1-5 ngày làm việc.";
        }
        if (question.contains("chat lieu")) {
            return "Bạn xem phần mô tả sản phẩm để biết chất liệu và hướng dẫn bảo quản chi tiết.";
        }
        return "Bạn có thể hỏi về đổi trả, giao hàng, chất liệu hoặc chọn lại menu để tra cứu nhanh.";
    }

    private String normalizeLast4(String value) {
        String digits = digitsOnly(value);
        return digits.length() <= 4 ? digits : digits.substring(digits.length() - 4);
    }

    private String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("\\D+", "");
    }
}
