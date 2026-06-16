package vn.edu.hcmuaf.fit.marketplace.chatbot.service;

import org.junit.jupiter.api.Test;
import vn.edu.hcmuaf.fit.marketplace.entity.Address;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;
import vn.edu.hcmuaf.fit.marketplace.service.OrderService;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CustomerSupportChatServiceImplTest {

    private static final FaqContentLookupService NOOP_FAQ_LOOKUP = rawQuestion -> Optional.empty();

    @Test
    void lookupOrderStatus_returnsSuccessWhenOrderAndPhoneMatch() {
        StubOrderService orderService = new StubOrderService();
        orderService.order = buildOrder("DH-260412-000037", Order.OrderStatus.SHIPPED, Order.PaymentStatus.PAID, "0901 123 456");
        CustomerSupportChatServiceImpl service = new CustomerSupportChatServiceImpl(orderService, NOOP_FAQ_LOOKUP);

        CustomerSupportChatService.OrderLookupResult result = service.lookupOrderStatus("dh-260412-000037", "3456");

        assertTrue(result.ok(), result.message());
        assertTrue(result.message().contains("DH-260412-000037"));
        assertTrue(result.message().contains("Đơn đang giao"));
    }

    @Test
    void lookupOrderStatus_returnsFailureWhenPhoneLast4Mismatch() {
        StubOrderService orderService = new StubOrderService();
        orderService.order = buildOrder("DH-260412-000037", Order.OrderStatus.PROCESSING, Order.PaymentStatus.UNPAID, "0901123456");
        CustomerSupportChatServiceImpl service = new CustomerSupportChatServiceImpl(orderService, NOOP_FAQ_LOOKUP);

        CustomerSupportChatService.OrderLookupResult result = service.lookupOrderStatus("DH-260412-000037", "9999");

        assertFalse(result.ok());
        assertTrue(result.message().contains("Không xác minh được"));
    }

    @Test
    void lookupOrderStatus_returnsFailureWhenOrderNotFound() {
        StubOrderService orderService = new StubOrderService();
        orderService.notFound = true;
        CustomerSupportChatServiceImpl service = new CustomerSupportChatServiceImpl(orderService, NOOP_FAQ_LOOKUP);

        CustomerSupportChatService.OrderLookupResult result = service.lookupOrderStatus("DH-NOT-FOUND", "1234");

        assertFalse(result.ok());
        assertTrue(result.message().contains("Không tìm thấy đơn hàng"));
    }

    @Test
    void recommendSize_mapsBoundaryRangesCorrectly() {
        CustomerSupportChatServiceImpl service = new CustomerSupportChatServiceImpl(new StubOrderService(), NOOP_FAQ_LOOKUP);

        assertEquals("S", service.recommendSize(155, 50).suggestedSize());
        assertEquals("M", service.recommendSize(165, 58).suggestedSize());
        assertEquals("L", service.recommendSize(172, 67).suggestedSize());
        assertEquals("XL", service.recommendSize(180, 75).suggestedSize());
        assertEquals("XXL", service.recommendSize(188, 85).suggestedSize());
    }

    @Test
    void answerProductFaq_prefersConfiguredFaqKeywordMatch() {
        StubOrderService orderService = new StubOrderService();
        FaqContentLookupService faqLookupService = rawQuestion -> Optional.of("Cau tra loi tu FAQ keyword.");
        CustomerSupportChatServiceImpl service = new CustomerSupportChatServiceImpl(orderService, faqLookupService);

        String result = service.answerProductFaq("toi muon doi size");

        assertEquals("Cau tra loi tu FAQ keyword.", result);
    }

    @Test
    void findConfiguredProductFaqAnswer_returnsConfiguredAnswer() {
        FaqContentLookupService faqLookupService = rawQuestion -> Optional.of("Cau tra loi da cau hinh.");
        CustomerSupportChatServiceImpl service = new CustomerSupportChatServiceImpl(new StubOrderService(), faqLookupService);

        Optional<String> result = service.findConfiguredProductFaqAnswer("phi van chuyen");

        assertTrue(result.isPresent());
        assertEquals("Cau tra loi da cau hinh.", result.get());
    }

    @Test
    void answerProductFaq_matchesVietnameseFallbackWithAccents() {
        CustomerSupportChatServiceImpl service = new CustomerSupportChatServiceImpl(new StubOrderService(), NOOP_FAQ_LOOKUP);

        String result = service.answerProductFaq("Chính sách đổi trả như thế nào?");

        assertTrue(result.contains("đổi/trả"));
    }

    private Order buildOrder(String code, Order.OrderStatus status, Order.PaymentStatus paymentStatus, String phone) {
        Order order = new Order();
        order.setOrderCode(code);
        order.setStatus(status);
        order.setPaymentStatus(paymentStatus);
        Address address = new Address();
        address.setPhone(phone);
        order.setShippingAddress(address);
        return order;
    }

    private static final class StubOrderService extends OrderService {
        private Order order;
        private boolean notFound;

        private StubOrderService() {
            super(null, null, null, null, null, null, null, null, null, null, null);
        }

        @Override
        public Order findByCode(String code) {
            if (notFound || order == null) {
                throw new ResourceNotFoundException("Order not found");
            }
            return order;
        }
    }
}
