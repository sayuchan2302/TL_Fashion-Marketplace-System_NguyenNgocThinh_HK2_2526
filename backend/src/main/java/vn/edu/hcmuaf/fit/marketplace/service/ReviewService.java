package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.http.HttpStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.dto.request.ReviewRequestDTO;
import vn.edu.hcmuaf.fit.marketplace.dto.response.ReviewEligibleItemResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.ReviewResponse;
import vn.edu.hcmuaf.fit.marketplace.dto.response.VendorReviewSummaryResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Notification;
import vn.edu.hcmuaf.fit.marketplace.entity.Order;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.Review;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;
import vn.edu.hcmuaf.fit.marketplace.repository.OrderRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ReviewRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final OrderRepository orderRepository;
    private final StoreRepository storeRepository;
    private final NotificationDomainService notificationDomainService;

    private static final String REVIEW_NOTIFICATION_LINK = "/profile?tab=reviews";
    private static final String REVIEW_NOTIFICATION_TITLE_ADMIN = "Hệ thống đã phản hồi đánh giá của bạn";
    private static final String REVIEW_NOTIFICATION_TITLE_VENDOR = "Shop đã phản hồi đánh giá của bạn";

    public ReviewService(
            ReviewRepository reviewRepository,
            ProductRepository productRepository,
            UserRepository userRepository,
            OrderRepository orderRepository,
            StoreRepository storeRepository,
            NotificationDomainService notificationDomainService) {
        this.reviewRepository = reviewRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
        this.orderRepository = orderRepository;
        this.storeRepository = storeRepository;
        this.notificationDomainService = notificationDomainService;
    }

    private List<String> toPlainImages(Review review) {
        List<String> images = review.getImages();
        if (images == null || images.isEmpty()) {
            return Collections.emptyList();
        }
        // Break Hibernate lazy collection reference before leaving transaction
        // boundary.
        return new ArrayList<>(images);
    }

    private ReviewResponse toReviewResponse(Review review) {
        Product product = review.getProduct();
        return ReviewResponse.builder()
                .id(review.getId())
                .storeId(review.getStoreId())
                .productId(product != null ? product.getId() : null)
                .productSlug(product != null ? product.getSlug() : null)
                .productName(product != null ? product.getName() : "Unknown Product")
                .productImage(resolveProductImage(product))
                .customerName(review.getUser() != null ? review.getUser().getName() : "Unknown Customer")
                .customerEmail(review.getUser() != null ? review.getUser().getEmail() : "Unknown Email")
                .rating(review.getRating())
                .content(review.getContent())
                .images(toPlainImages(review))
                .date(review.getCreatedAt())
                .status(review.getStatus() != null ? review.getStatus().name() : null)
                .reply(review.getShopReply())
                .replyAt(review.getShopReplyAt())
                .orderId(review.getOrder() != null ? review.getOrder().getId().toString() : null)
                .orderCode(review.getOrder() != null ? review.getOrder().getOrderCode() : null)
                .variantName(resolvePurchasedVariantName(review))
                .version(review.getVersion())
                .build();
    }

    private String resolveProductImage(Product product) {
        if (product == null) {
            return null;
        }
        List<vn.edu.hcmuaf.fit.marketplace.entity.ProductImage> images = product.getImages();
        if (images == null || images.isEmpty()) {
            return null;
        }
        return images.get(0).getUrl();
    }

    private String resolvePurchasedVariantName(Review review) {
        if (review == null || review.getOrder() == null || review.getProduct() == null
                || review.getProduct().getId() == null) {
            return null;
        }

        List<vn.edu.hcmuaf.fit.marketplace.entity.OrderItem> orderItems = review.getOrder().getItems();
        if (orderItems == null || orderItems.isEmpty()) {
            return null;
        }

        UUID productId = review.getProduct().getId();
        return orderItems.stream()
                .filter(item -> item != null
                        && item.getProduct() != null
                        && item.getProduct().getId() != null
                        && productId.equals(item.getProduct().getId()))
                .map(item -> normalizeOptionalText(item.getVariantName()))
                .filter(value -> !value.isBlank())
                .findFirst()
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public Page<ReviewResponse> getAllReviews(Review.ReviewStatus status, Pageable pageable) {
        Page<Review> page = status == null ? reviewRepository.findAll(pageable)
                : reviewRepository.findByStatus(status, pageable);
        List<ReviewResponse> content = page.getContent().stream()
                .map(this::toReviewResponse)
                .collect(Collectors.toList());
        return new PageImpl<>(content, pageable, page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public Page<ReviewResponse> getStoreReviews(UUID storeId, Review.ReviewStatus status, Pageable pageable) {
        return getStoreReviews(storeId, status, null, null, null, pageable);
    }

    @Transactional(readOnly = true)
    public Page<ReviewResponse> getStoreReviews(
            UUID storeId,
            Review.ReviewStatus status,
            String keyword,
            Boolean needReply,
            Integer maxRating,
            Pageable pageable) {
        String normalizedKeyword = keyword == null ? null : keyword.trim();
        if (normalizedKeyword != null && normalizedKeyword.isEmpty()) {
            normalizedKeyword = null;
        }

        Page<Review> page = reviewRepository.searchStoreReviews(
                storeId,
                status,
                normalizedKeyword,
                needReply,
                maxRating,
                pageable);

        List<ReviewResponse> content = page.getContent().stream()
                .map(this::toReviewResponse)
                .collect(Collectors.toList());
        return new PageImpl<>(content, pageable, page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public VendorReviewSummaryResponse getStoreReviewSummary(UUID storeId) {
        long total = reviewRepository.countByStoreId(storeId);
        long needReply = reviewRepository.countByStoreIdNeedReply(storeId);
        long negative = reviewRepository.countByStoreIdWithMaxRating(storeId, 3);
        Double average = reviewRepository.calculateRawAverageRatingByStoreId(storeId);

        return VendorReviewSummaryResponse.builder()
                .total(total)
                .needReply(needReply)
                .negative(negative)
                .average(average == null ? 0.0 : Math.round(average * 10.0) / 10.0)
                .build();
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getVisibleProductReviews(UUID productId) {
        return reviewRepository.findVisibleProductReviews(productId, Review.ReviewStatus.HIDDEN)
                .stream()
                .map(this::toReviewResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getVisibleStoreReviews(UUID storeId) {
        return reviewRepository.findByStoreIdAndStatusNotOrderByCreatedAtDesc(storeId, Review.ReviewStatus.HIDDEN)
                .stream()
                .map(this::toReviewResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getCustomerReviews(UUID userId, UUID orderId, UUID productId) {
        return reviewRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .filter(review -> orderId == null
                        || (review.getOrder() != null && orderId.equals(review.getOrder().getId())))
                .filter(review -> productId == null
                        || (review.getProduct() != null && productId.equals(review.getProduct().getId())))
                .map(this::toReviewResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReviewEligibleItemResponse> getEligibleCustomerReviews(UUID userId) {
        return orderRepository.findEligibleReviewItemsByUserId(userId).stream()
                .map(item -> ReviewEligibleItemResponse.builder()
                        .orderId(item.getOrderId())
                        .productId(item.getProductId())
                        .productSlug(item.getProductSlug() == null ? "" : item.getProductSlug())
                        .productName(item.getProductName() == null || item.getProductName().isBlank() ? "Sản phẩm"
                                : item.getProductName())
                        .productImage(item.getProductImage() == null ? "" : item.getProductImage())
                        .variantName(item.getVariantName() == null ? "" : item.getVariantName())
                        .quantity(item.getQuantity() == null ? 0 : item.getQuantity())
                        .deliveredAt(item.getDeliveredAt())
                        .build())
                .toList();
    }

    @Transactional
    public ReviewResponse submitCustomerReview(UUID userId, ReviewRequestDTO request) {
        Product product = productRepository.findById(request.getProductId())
                .orElseThrow(() -> new ResourceNotFoundException("Product not found"));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (product.getStoreId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Product is not associated with a store");
        }

        Order order = resolveDeliveredOrderForReview(userId, request.getProductId(), request.getOrderId());

        if (reviewRepository.existsByUserIdAndProductIdAndOrderId(userId, request.getProductId(), order.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "You have already reviewed this product for the order");
        }

        Review review = Review.builder()
                .product(product)
                .user(user)
                .order(order)
                .storeId(product.getStoreId())
                .rating(request.getRating())
                .title(safeTitle(request.getTitle()))
                .content(request.getContent().trim())
                .images(normalizeImages(request.getImages()))
                .helpful(0)
                .status(Review.ReviewStatus.APPROVED)
                .version(1)
                .build();

        Review saved = reviewRepository.save(review);
        refreshStoreAverageRating(product.getStoreId());
        return toReviewResponse(saved);
    }

    @Transactional
    public ReviewResponse updateStatus(UUID id, Review.ReviewStatus status) {
        if (status != Review.ReviewStatus.HIDDEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only HIDDEN status is supported");
        }
        Review review = reviewRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Review not found"));
        review.setStatus(status);
        Review saved = reviewRepository.save(review);
        refreshStoreAverageRating(saved.getStoreId());
        return toReviewResponse(saved);
    }

    @Transactional
    public ReviewResponse addReply(UUID id, String reply) {
        Review review = reviewRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Review not found"));
        String previousReply = normalizeOptionalText(review.getShopReply());
        String normalizedReply = normalizeRequiredText(reply, "Reply content cannot be empty");
        review.setShopReply(normalizedReply);
        review.setShopReplyAt(LocalDateTime.now());
        Review saved = reviewRepository.save(review);
        notifyCustomerReviewReply(saved, previousReply, normalizedReply, true);
        return toReviewResponse(saved);
    }

    @Transactional
    public ReviewResponse addStoreReply(UUID id, UUID storeId, String reply) {
        Review review = reviewRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new ResourceNotFoundException("Review not found"));
        String previousReply = normalizeOptionalText(review.getShopReply());
        String normalizedReply = normalizeRequiredText(reply, "Reply content cannot be empty");
        review.setShopReply(normalizedReply);
        review.setShopReplyAt(LocalDateTime.now());
        Review saved = reviewRepository.save(review);
        notifyCustomerReviewReply(saved, previousReply, normalizedReply, false);
        return toReviewResponse(saved);
    }

    @Transactional
    public void deleteReview(UUID id) {
        Review review = reviewRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Review not found"));
        reviewRepository.deleteById(id);
        refreshStoreAverageRating(review.getStoreId());
    }

    private void refreshStoreAverageRating(UUID storeId) {
        if (storeId == null) {
            return;
        }
        Store store = storeRepository.findById(storeId).orElse(null);
        if (store == null) {
            return;
        }
        Double average = reviewRepository.calculateAverageRatingByStoreId(storeId);
        double normalized = average == null ? 0.0 : Math.round(average * 10.0) / 10.0;
        store.setRating(normalized);
        storeRepository.save(store);
    }

    private String safeTitle(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private void notifyCustomerReviewReply(Review review, String previousReply, String currentReply,
            boolean adminReply) {
        if (notificationDomainService == null || review == null || review.getUser() == null
                || review.getUser().getId() == null) {
            return;
        }
        if (normalizeOptionalText(previousReply).equals(normalizeOptionalText(currentReply))) {
            return;
        }

        String productName = review.getProduct() == null
                ? "sản phẩm"
                : normalizeOptionalText(review.getProduct().getName());
        if (productName.isEmpty()) {
            productName = "sản phẩm";
        }
        String message = "Đánh giá cho sản phẩm " + productName + " đã có phản hồi mới.";
        String targetLink = REVIEW_NOTIFICATION_LINK;
        if (review.getProduct() != null && review.getProduct().getId() != null) {
            targetLink = "/product/" + review.getProduct().getId() + "?reviewId=" + review.getId();
        }
        notificationDomainService.createAndPush(
                review.getUser().getId(),
                Notification.NotificationType.REVIEW,
                adminReply ? REVIEW_NOTIFICATION_TITLE_ADMIN : REVIEW_NOTIFICATION_TITLE_VENDOR,
                message,
                targetLink);
    }

    private Order resolveDeliveredOrderForReview(UUID userId, UUID productId, UUID orderId) {
        if (orderId != null) {
            boolean purchasedByOrder = orderRepository.existsDeliveredOrderItemByUserAndOrderAndProduct(
                    userId,
                    orderId,
                    productId);
            if (!purchasedByOrder) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "You can only review products from delivered orders that you purchased");
            }
            return orderRepository.findByUserIdAndId(userId, orderId)
                    .orElseThrow(() -> new ResourceNotFoundException("Order not found"));
        }

        boolean purchased = orderRepository.existsDeliveredOrderItemByUserAndProduct(userId, productId);
        if (!purchased) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You can only review products that you have purchased");
        }

        List<Order> deliveredOrders = orderRepository.findDeliveredOrdersByUserAndProduct(
                userId,
                productId,
                PageRequest.of(0, 1));
        if (deliveredOrders.isEmpty()) {
            throw new ResourceNotFoundException("Delivered order not found");
        }
        return deliveredOrders.get(0);
    }

    private List<String> normalizeImages(List<String> images) {
        if (images == null || images.isEmpty()) {
            return new ArrayList<>();
        }
        return images.stream()
                .map(String::trim)
                .filter(url -> !url.isEmpty())
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private String normalizeOptionalText(String value) {
        return value == null ? "" : value.trim();
    }

    private String normalizeRequiredText(String value, String message) {
        String normalized = normalizeOptionalText(value);
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return normalized;
    }

}
