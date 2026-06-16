package vn.edu.hcmuaf.fit.marketplace.chatbot.service;

import java.util.Optional;

public interface CustomerSupportChatService {

    OrderLookupResult lookupOrderStatus(String orderCode, String phoneLast4);

    SizeAdviceResult recommendSize(int heightCm, int weightKg);

    Optional<String> findConfiguredProductFaqAnswer(String rawQuestion);

    String answerProductFaq(String rawQuestion);

    record OrderLookupResult(boolean ok, String message) {}

    record SizeAdviceResult(String suggestedSize, String message) {}
}
