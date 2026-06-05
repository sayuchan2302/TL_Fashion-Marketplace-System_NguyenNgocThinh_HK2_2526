package vn.edu.hcmuaf.fit.marketplace.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import vn.edu.hcmuaf.fit.marketplace.dto.response.NotificationRealtimePayload;
import vn.edu.hcmuaf.fit.marketplace.dto.response.NotificationResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Notification;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.repository.NotificationRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;

import java.util.Locale;
import java.util.UUID;

@Slf4j
@Service
public class NotificationDomainService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public NotificationDomainService(
            NotificationRepository notificationRepository,
            UserRepository userRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional(readOnly = true)
    public Page<NotificationResponse> listForUser(
            UUID userId,
            Boolean read,
            Notification.NotificationType type,
            Pageable pageable
    ) {
        Specification<Notification> spec = Specification.where((root, query, cb) ->
                cb.equal(root.get("user").get("id"), userId)
        );
        if (read != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("isRead"), read));
        }
        if (type != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("type"), type));
        }
        return notificationRepository.findAll(spec, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public long countUnreadByUser(UUID userId) {
        return notificationRepository.countByUserIdAndIsReadFalse(userId);
    }

    @Transactional
    public NotificationResponse markAsRead(UUID userId, UUID notificationId) {
        Notification notification = notificationRepository.findByIdAndUserId(notificationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found"));
        if (!Boolean.TRUE.equals(notification.getIsRead())) {
            notification.setIsRead(true);
            notification = notificationRepository.save(notification);
        }
        return toResponse(notification);
    }

    @Transactional
    public int markAllAsRead(UUID userId) {
        return notificationRepository.markAllAsReadByUserId(userId);
    }

    @Transactional
    public void delete(UUID userId, UUID notificationId) {
        Notification notification = notificationRepository.findByIdAndUserId(notificationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found"));
        notificationRepository.delete(notification);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public NotificationResponse createAndPush(
            UUID userId,
            Notification.NotificationType type,
            String title,
            String message,
            String link
    ) {
        return createAndPushInternal(userId, type, title, message, link, true);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public NotificationResponse createAndPushStrict(
            UUID userId,
            Notification.NotificationType type,
            String title,
            String message,
            String link
    ) {
        return createAndPushInternal(userId, type, title, message, link, false);
    }

    private NotificationResponse createAndPushInternal(
            UUID userId,
            Notification.NotificationType type,
            String title,
            String message,
            String link,
            boolean suppressException
    ) {
        try {
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new IllegalStateException("Cannot create notification because user does not exist: " + userId));

            Notification notification = Notification.builder()
                    .user(user)
                    .type(type == null ? Notification.NotificationType.SYSTEM : type)
                    .title(trimOrFallback(normalizeLegacyNotificationText(title), "Thông báo hệ thống"))
                    .message(trimOrNull(normalizeLegacyNotificationText(message)))
                    .link(trimOrNull(link))
                    .isRead(false)
                    .build();
            Notification saved = notificationRepository.save(notification);

            long unreadCount = notificationRepository.countByUserIdAndIsReadFalse(userId);
            NotificationResponse response = toResponse(saved);
            pushCreatedEvent(user.getEmail(), response, unreadCount);
            return response;
        } catch (Exception ex) {
            if (!suppressException) {
                if (ex instanceof RuntimeException runtimeException) {
                    throw runtimeException;
                }
                throw new IllegalStateException("Cannot create/push notification", ex);
            }
            log.warn("Cannot create/push notification for userId={}: {}", userId, ex.getMessage());
            return null;
        }
    }

    public NotificationResponse toResponse(Notification notification) {
        if (notification == null) return null;
        String rawType = notification.getType() == null
                ? Notification.NotificationType.SYSTEM.name()
                : notification.getType().name();
        return NotificationResponse.builder()
                .id(notification.getId())
                .type(rawType.toLowerCase(Locale.ROOT))
                .title(normalizeLegacyNotificationText(notification.getTitle()))
                .message(normalizeLegacyNotificationText(notification.getMessage()))
                .image(notification.getImage())
                .link(notification.getLink())
                .read(Boolean.TRUE.equals(notification.getIsRead()))
                .createdAt(notification.getCreatedAt())
                .build();
    }

    private void pushCreatedEvent(String userEmail, NotificationResponse notification, long unreadCount) {
        if (userEmail == null || userEmail.isBlank() || notification == null) {
            return;
        }
        try {
            NotificationRealtimePayload payload = NotificationRealtimePayload.builder()
                    .event("CREATED")
                    .notification(notification)
                    .unreadCount(unreadCount)
                    .build();
            messagingTemplate.convertAndSendToUser(userEmail, "/queue/notifications", payload);
        } catch (Exception ex) {
            log.warn("Cannot push notification via WS for user={}: {}", userEmail, ex.getMessage());
        }
    }

    private String trimOrNull(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String trimOrFallback(String value, String fallback) {
        String normalized = trimOrNull(value);
        return normalized == null ? fallback : normalized;
    }

    /**
     * Normalize legacy notification text that was stored without Vietnamese accents.
     * This keeps historical notifications readable without requiring manual DB migration.
     */
    private String normalizeLegacyNotificationText(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        return value
                .replace("San vua co voucher moi", "Sàn vừa có voucher mới")
                .replace("vua co voucher moi", "vừa có voucher mới")
                .replace("se het han trong 24 gio", "sẽ hết hạn trong 24 giờ")
                .replace("sap het han trong 3 gio", "sắp hết hạn trong 3 giờ")
                .replace("Nhan vao de xem va su dung uu dai moi.", "Nhấn vào để xem và sử dụng ưu đãi mới.")
                .replace("Uu dai moi da cap nhat trong vi voucher cua ban.", "Ưu đãi mới đã cập nhật trong ví voucher của bạn.")
                .replace("Nhan vao de su dung voucher truoc khi het han.", "Nhấn vào để sử dụng voucher trước khi hết hạn.");
    }
}

