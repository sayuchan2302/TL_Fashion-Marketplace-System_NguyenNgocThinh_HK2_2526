package vn.edu.hcmuaf.fit.marketplace.chatbot;

import com.microsoft.bot.builder.ActivityHandler;
import com.microsoft.bot.builder.ConversationState;
import com.microsoft.bot.builder.MessageFactory;
import com.microsoft.bot.builder.StatePropertyAccessor;
import com.microsoft.bot.builder.TurnContext;
import com.microsoft.bot.schema.Activity;
import com.microsoft.bot.schema.ChannelAccount;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.stereotype.Component;
import vn.edu.hcmuaf.fit.marketplace.chatbot.scenario.BotScenarioActionKey;
import vn.edu.hcmuaf.fit.marketplace.chatbot.scenario.BotScenarioPayload;
import vn.edu.hcmuaf.fit.marketplace.chatbot.scenario.BotScenarioService;
import vn.edu.hcmuaf.fit.marketplace.chatbot.service.ChatbotAiFallbackService;
import vn.edu.hcmuaf.fit.marketplace.chatbot.service.CustomerSupportChatService;
import vn.edu.hcmuaf.fit.marketplace.chatbot.service.CustomerSupportChatService.OrderLookupResult;
import vn.edu.hcmuaf.fit.marketplace.chatbot.service.CustomerSupportChatService.SizeAdviceResult;
import vn.edu.hcmuaf.fit.marketplace.config.ChatbotProperties;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

@Component
public class MarketplaceBot extends ActivityHandler {

    private static final String WEBCHAT_JOIN_EVENT = "webchat/join";

    private final ConversationState conversationState;
    private final StatePropertyAccessor<Object> sessionAccessor;
    private final CustomerSupportChatService supportChatService;
    private final ChatbotAiFallbackService aiFallbackService;
    private final ChatbotProperties chatbotProperties;
    private final BotScenarioService botScenarioService;

    public MarketplaceBot(
            ConversationState conversationState,
            CustomerSupportChatService supportChatService,
            ChatbotAiFallbackService aiFallbackService,
            ChatbotProperties chatbotProperties,
            BotScenarioService botScenarioService
    ) {
        this.conversationState = conversationState;
        this.supportChatService = supportChatService;
        this.aiFallbackService = aiFallbackService;
        this.chatbotProperties = chatbotProperties;
        this.botScenarioService = botScenarioService;
        this.sessionAccessor = conversationState.createProperty("customerSupportSession");
    }

    @Override
    public CompletableFuture<Void> onTurn(TurnContext turnContext) {
        return super.onTurn(turnContext)
                .thenCompose(ignore -> conversationState.saveChanges(turnContext, false));
    }

    @Override
    protected CompletableFuture<Void> onMembersAdded(List<ChannelAccount> membersAdded, TurnContext turnContext) {
        String botId = turnContext.getActivity().getRecipient() != null
                ? turnContext.getActivity().getRecipient().getId()
                : null;

        boolean hasRealUser = membersAdded.stream().anyMatch(member -> botId == null || !botId.equals(member.getId()));
        if (!hasRealUser) {
            return CompletableFuture.completedFuture(null);
        }
        return sendWelcomeIfNeeded(turnContext);
    }

    @Override
    protected CompletableFuture<Void> onEventActivity(TurnContext turnContext) {
        String eventName = turnContext.getActivity().getName();
        if (WEBCHAT_JOIN_EVENT.equalsIgnoreCase(eventName == null ? "" : eventName.trim())) {
            return sendWelcomeIfNeeded(turnContext);
        }
        return CompletableFuture.completedFuture(null);
    }

    @Override
    protected CompletableFuture<Void> onMessageActivity(TurnContext turnContext) {
        String normalizedInput = normalize(turnContext.getActivity().getText());
        BotScenarioPayload scenario = botScenarioService.getPublishedScenario();

        return sessionAccessor.get(turnContext, ChatSessionState::new)
                .thenCompose(rawState -> {
                    ChatSessionState state = toChatSessionState(rawState);
                    return sessionAccessor.set(turnContext, state)
                            .thenCompose(ignore -> routeMessage(turnContext, state, normalizedInput, scenario));
                });
    }

    private ChatSessionState toChatSessionState(Object rawState) {
        if (rawState == null) {
            return new ChatSessionState();
        }
        if (rawState instanceof ChatSessionState state) {
            return state;
        }
        if (rawState instanceof Map<?, ?> map) {
            return convertStateValues(
                    map.get("step"),
                    map.get("pendingOrderCode"),
                    map.get("heightCm"),
                    map.get("welcomed")
            );
        }

        ChatSessionState remappedState = remapUnknownStateObject(rawState);
        if (remappedState != null) {
            return remappedState;
        }

        return new ChatSessionState();
    }

    private ChatSessionState remapUnknownStateObject(Object rawState) {
        boolean hasStateShape =
                hasProperty(rawState, "step")
                        || hasProperty(rawState, "pendingOrderCode")
                        || hasProperty(rawState, "heightCm")
                        || hasProperty(rawState, "welcomed");

        if (!hasStateShape) {
            return null;
        }

        return convertStateValues(
                readProperty(rawState, "step"),
                readProperty(rawState, "pendingOrderCode"),
                readProperty(rawState, "heightCm"),
                readProperty(rawState, "welcomed")
        );
    }

    private ChatSessionState convertStateValues(
            Object rawStep,
            Object rawPendingOrderCode,
            Object rawHeightCm,
            Object rawWelcomed
    ) {
        ChatSessionState state = new ChatSessionState();

        if (rawStep != null) {
            try {
                state.step = ConversationStep.valueOf(rawStep.toString());
            } catch (IllegalArgumentException ignored) {
                state.step = ConversationStep.ROOT;
            }
        }

        if (rawPendingOrderCode != null) {
            state.pendingOrderCode = rawPendingOrderCode.toString();
        }

        state.heightCm = parseNullableInt(rawHeightCm);
        state.welcomed = parseBoolean(rawWelcomed);
        return state;
    }

    private Integer parseNullableInt(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private boolean parseBoolean(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean boolValue) {
            return boolValue;
        }
        return Boolean.parseBoolean(value.toString());
    }

    private boolean hasProperty(Object target, String propertyName) {
        Class<?> type = target.getClass();
        String getterName = getterName(propertyName);

        try {
            type.getMethod(getterName);
            return true;
        } catch (NoSuchMethodException ignored) {
            // ignore
        }

        try {
            type.getDeclaredField(propertyName);
            return true;
        } catch (NoSuchFieldException ignored) {
            return false;
        }
    }

    private Object readProperty(Object target, String propertyName) {
        Class<?> type = target.getClass();
        String getterName = getterName(propertyName);

        try {
            Method getter = type.getMethod(getterName);
            return getter.invoke(target);
        } catch (Exception ignored) {
            // Fall back to field access for foreign classloader objects.
        }

        try {
            Field field = type.getDeclaredField(propertyName);
            field.setAccessible(true);
            return field.get(target);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String getterName(String propertyName) {
        if (propertyName == null || propertyName.isBlank()) {
            return propertyName;
        }
        return "get" + Character.toUpperCase(propertyName.charAt(0)) + propertyName.substring(1);
    }

    private CompletableFuture<Void> routeMessage(
            TurnContext turnContext,
            ChatSessionState state,
            String input,
            BotScenarioPayload scenario
    ) {
        if (state.step == ConversationStep.AWAIT_ORDER_CODE) {
            state.pendingOrderCode = input == null ? "" : input.trim().toUpperCase(Locale.ROOT);
            state.step = ConversationStep.AWAIT_ORDER_PHONE4;
            return sendText(turnContext, scenario.getAskOrderPhonePrompt());
        }

        if (state.step == ConversationStep.AWAIT_ORDER_PHONE4) {
            String phone4 = onlyDigits(input);
            if (phone4.length() != 4) {
                return sendText(turnContext, scenario.getOrderPhoneInvalidPrompt());
            }

            OrderLookupResult result = supportChatService.lookupOrderStatus(state.pendingOrderCode, phone4);
            state.reset();
            return sendText(turnContext, result.message())
                    .thenCompose(ignore -> sendMainMenu(turnContext, scenario.getOrderLookupContinuePrompt(), scenario));
        }

        if (state.step == ConversationStep.AWAIT_HEIGHT) {
            Integer height = parsePositiveInt(input);
            if (height == null || height < 120 || height > 230) {
                return sendText(turnContext, scenario.getInvalidHeightPrompt());
            }
            state.heightCm = height;
            state.step = ConversationStep.AWAIT_WEIGHT;
            return sendText(turnContext, scenario.getAskWeightPrompt());
        }

        if (state.step == ConversationStep.AWAIT_WEIGHT) {
            Integer weight = parsePositiveInt(input);
            if (weight == null || weight < 30 || weight > 200) {
                return sendText(turnContext, scenario.getInvalidWeightPrompt());
            }

            SizeAdviceResult advice = supportChatService.recommendSize(state.heightCm, weight);
            state.reset();
            return sendText(turnContext, advice.message())
                    .thenCompose(ignore -> sendMainMenu(turnContext, scenario.getSizeAdviceContinuePrompt(), scenario));
        }

        Optional<BotScenarioActionKey> matchedQuickAction = findMatchedQuickAction(scenario, input);
        if (matchedQuickAction.filter(BotScenarioActionKey.ORDER_LOOKUP::equals).isPresent()) {
            state.step = ConversationStep.AWAIT_ORDER_CODE;
            return sendText(turnContext, scenario.getAskOrderCodePrompt());
        }
        if (matchedQuickAction.filter(BotScenarioActionKey.SIZE_ADVICE::equals).isPresent()) {
            state.step = ConversationStep.AWAIT_HEIGHT;
            return sendText(turnContext, scenario.getAskHeightPrompt());
        }
        if (matchedQuickAction.filter(BotScenarioActionKey.PRODUCT_FAQ::equals).isPresent()) {
            String answer = supportChatService.answerProductFaq(turnContext.getActivity().getText());
            return sendText(turnContext, answer)
                    .thenCompose(ignore -> sendMainMenu(turnContext, scenario.getProductFaqContinuePrompt(), scenario));
        }

        Optional<String> configuredFaqAnswer = supportChatService.findConfiguredProductFaqAnswer(turnContext.getActivity().getText());
        if (configuredFaqAnswer.isPresent()) {
            return sendText(turnContext, configuredFaqAnswer.get())
                    .thenCompose(ignore -> sendMainMenu(turnContext, scenario.getProductFaqContinuePrompt(), scenario));
        }

        if (chatbotProperties.isAiFallbackEnabled()) {
            Optional<String> aiResponse = aiFallbackService.tryGenerateReply(turnContext.getActivity().getText());
            if (aiResponse.isPresent() && !aiResponse.get().isBlank()) {
                return sendText(turnContext, aiResponse.get());
            }
        }

        return sendMainMenu(turnContext, scenario.getUnknownPrompt(), scenario);
    }

    private CompletableFuture<Void> sendWelcomeIfNeeded(TurnContext turnContext) {
        BotScenarioPayload scenario = botScenarioService.getPublishedScenario();
        return sessionAccessor.get(turnContext, ChatSessionState::new)
                .thenCompose(rawState -> {
                    ChatSessionState state = toChatSessionState(rawState);
                    if (state.welcomed) {
                        return CompletableFuture.completedFuture(null);
                    }

                    state.welcomed = true;
                    return sessionAccessor.set(turnContext, state)
                            .thenCompose(ignore -> sendMainMenu(turnContext, scenario.getWelcomePrompt(), scenario));
                });
    }

    private CompletableFuture<Void> sendMainMenu(TurnContext turnContext, String prompt, BotScenarioPayload scenario) {
        List<String> actions = scenario.getQuickActions() == null
                ? List.of()
                : scenario.getQuickActions().stream()
                .filter(action -> action != null && action.getLabel() != null && !action.getLabel().isBlank())
                .map(action -> action.getLabel().trim())
                .toList();

        Activity reply = MessageFactory.suggestedActions(actions, prompt);
        return sendActivity(turnContext, reply);
    }

    private Optional<BotScenarioActionKey> findMatchedQuickAction(BotScenarioPayload scenario, String normalizedInput) {
        if (scenario.getQuickActions() == null || normalizedInput == null) {
            return Optional.empty();
        }
        return scenario.getQuickActions().stream()
                .filter(action -> action != null && action.getKey() != null)
                .filter(action -> normalizedInput.equals(normalize(action.getLabel())))
                .map(action -> action.getKey())
                .findFirst();
    }

    private CompletableFuture<Void> sendText(TurnContext turnContext, String text) {
        return sendActivity(turnContext, MessageFactory.text(text));
    }

    private CompletableFuture<Void> sendActivity(TurnContext turnContext, Activity activity) {
        return turnContext.sendActivity(activity).thenApply(response -> null);
    }

    private String normalize(String value) {
        if (value == null) {
            return "";
        }
        String noAccent = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        String normalized = noAccent
                .replace('đ', 'd')
                .replace('Đ', 'D');
        return normalized.toLowerCase(Locale.ROOT).trim().replaceAll("\\s+", " ");
    }

    private String onlyDigits(String value) {
        return value == null ? "" : value.replaceAll("\\D+", "");
    }

    private Integer parsePositiveInt(String value) {
        try {
            return Integer.parseInt(onlyDigits(value));
        } catch (Exception ex) {
            return null;
        }
    }

    enum ConversationStep {
        ROOT, AWAIT_ORDER_CODE, AWAIT_ORDER_PHONE4, AWAIT_HEIGHT, AWAIT_WEIGHT
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    static class ChatSessionState {
        private ConversationStep step = ConversationStep.ROOT;
        private String pendingOrderCode;
        private Integer heightCm;
        private boolean welcomed;

        void reset() {
            this.step = ConversationStep.ROOT;
            this.pendingOrderCode = null;
            this.heightCm = null;
        }
    }
}

