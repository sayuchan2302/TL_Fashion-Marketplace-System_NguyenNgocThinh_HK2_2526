package vn.edu.hcmuaf.fit.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import vn.edu.hcmuaf.fit.marketplace.dto.response.NotificationResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.ReviewResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Notification;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.Review;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReviewRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReviewServiceNotificationTest {

    @Mock
    private ReviewRepository reviewRepository;

    @Mock
    private ProductRepository productRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private StoreRepository storeRepository;

    private CapturingNotificationDomainService notificationDomainService;
    private ReviewService reviewService;

    @BeforeEach
    void setUp() {
        notificationDomainService = new CapturingNotificationDomainService();
        reviewService = new ReviewService(
                reviewRepository,
                productRepository,
                userRepository,
                orderRepository,
                storeRepository,
                notificationDomainService);
    }

    @Test
    void addStoreReplyWithNewContentPushesReviewNotification() {
        UUID reviewId = UUID.randomUUID();
        UUID storeId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();

        Review review = buildReview(reviewId, storeId, customerId, Review.ReviewStatus.APPROVED, null);
        when(reviewRepository.findByIdAndStoreId(reviewId, storeId)).thenReturn(Optional.of(review));
        when(reviewRepository.save(any(Review.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ReviewResponse response = reviewService.addStoreReply(reviewId, storeId, "  Cảm ơn bạn đã đánh giá!  ");

        assertEquals("Cảm ơn bạn đã đánh giá!", response.getReply());
        assertEquals(1, notificationDomainService.invocations.size());
        NotificationInvocation call = notificationDomainService.invocations.get(0);
        assertEquals(customerId, call.userId());
        assertEquals(Notification.NotificationType.REVIEW, call.type());
        assertEquals("Shop đã phản hồi đánh giá của bạn", call.title());
        assertEquals("Đánh giá cho sản phẩm Áo khoác đã có phản hồi mới.", call.message());
        assertEquals("/product/" + review.getProduct().getId() + "?reviewId=" + review.getId(), call.link());
    }

    @Test
    void addReplyAsAdminWithNewContentPushesReviewNotification() {
        UUID reviewId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID storeId = UUID.randomUUID();

        Review review = buildReview(reviewId, storeId, customerId, Review.ReviewStatus.APPROVED, null);
        when(reviewRepository.findById(reviewId)).thenReturn(Optional.of(review));
        when(reviewRepository.save(any(Review.class))).thenAnswer(invocation -> invocation.getArgument(0));

        reviewService.addReply(reviewId, "Hệ thống đã tiếp nhận góp ý của bạn.");

        assertEquals(1, notificationDomainService.invocations.size());
        NotificationInvocation call = notificationDomainService.invocations.get(0);
        assertEquals(customerId, call.userId());
        assertEquals(Notification.NotificationType.REVIEW, call.type());
        assertEquals("Hệ thống đã phản hồi đánh giá của bạn", call.title());
        assertEquals("Đánh giá cho sản phẩm Áo khoác đã có phản hồi mới.", call.message());
        assertEquals("/product/" + review.getProduct().getId() + "?reviewId=" + review.getId(), call.link());
    }

    @Test
    void addReplyWithSameContentDoesNotPushNotification() {
        UUID reviewId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID storeId = UUID.randomUUID();

        Review review = buildReview(
                reviewId,
                storeId,
                customerId,
                Review.ReviewStatus.APPROVED,
                "Shop phản hồi trước đó");
        when(reviewRepository.findById(reviewId)).thenReturn(Optional.of(review));
        when(reviewRepository.save(any(Review.class))).thenAnswer(invocation -> invocation.getArgument(0));

        reviewService.addReply(reviewId, " Shop phản hồi trước đó ");

        assertTrue(notificationDomainService.invocations.isEmpty());
    }

    @Test
    void addStoreReplyPendingReviewKeepsStatusAndStillPushesNotification() {
        UUID reviewId = UUID.randomUUID();
        UUID storeId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();

        Review review = buildReview(reviewId, storeId, customerId, Review.ReviewStatus.PENDING, null);
        when(reviewRepository.findByIdAndStoreId(reviewId, storeId)).thenReturn(Optional.of(review));
        when(reviewRepository.save(any(Review.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ReviewResponse response = reviewService.addStoreReply(reviewId, storeId, "Shop phản hồi mới");

        assertEquals("PENDING", response.getStatus());
        assertNotNull(response.getReplyAt());
        assertEquals(1, notificationDomainService.invocations.size());
    }

    private Review buildReview(
            UUID reviewId,
            UUID storeId,
            UUID customerId,
            Review.ReviewStatus status,
            String existingReply) {
        User customer = User.builder()
                .id(customerId)
                .email("customer@test.local")
                .password("secret")
                .name("Customer")
                .build();

        Product product = Product.builder()
                .id(UUID.randomUUID())
                .name("Áo khoác")
                .storeId(storeId)
                .build();

        Review review = Review.builder()
                .id(reviewId)
                .user(customer)
                .product(product)
                .storeId(storeId)
                .rating(5)
                .content("Great")
                .status(status)
                .shopReply(existingReply)
                .build();
        review.setId(reviewId);
        return review;
    }

    private record NotificationInvocation(
            UUID userId,
            Notification.NotificationType type,
            String title,
            String message,
            String link) {
    }

    private static final class CapturingNotificationDomainService extends NotificationDomainService {
        private final List<NotificationInvocation> invocations = new ArrayList<>();

        private CapturingNotificationDomainService() {
            super(null, null, null);
        }

        @Override
        public NotificationResponse createAndPush(
                UUID userId,
                Notification.NotificationType type,
                String title,
                String message,
                String link) {
            invocations.add(new NotificationInvocation(userId, type, title, message, link));
            return null;
        }
    }
}
