package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.dto.response.WishlistItemResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.ProductImage;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.entity.Wishlist;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.WishlistRepository;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class WishlistService {

    private final WishlistRepository wishlistRepository;
    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final StoreRepository storeRepository;

    public WishlistService(
            WishlistRepository wishlistRepository,
            UserRepository userRepository,
            ProductRepository productRepository,
            StoreRepository storeRepository) {
        this.wishlistRepository = wishlistRepository;
        this.userRepository = userRepository;
        this.productRepository = productRepository;
        this.storeRepository = storeRepository;
    }

    @Transactional(readOnly = true)
    public List<WishlistItemResponse> getMyWishlist(UUID userId) {
        List<Wishlist> wishlists = wishlistRepository.findByUserId(userId);
        return wishlists.stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public void addToWishlist(UUID userId, String productIdOrSlug) {
        Product product = resolveProduct(productIdOrSlug);
        UUID productId = product.getId();

        if (wishlistRepository.existsByUserIdAndProductId(userId, productId)) {
            return;
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Wishlist wishlist = Wishlist.builder()
                .user(user)
                .product(product)
                .build();

        wishlistRepository.save(wishlist);
    }

    @Transactional
    public void removeFromWishlist(UUID userId, String productIdOrSlug) {
        Product product = resolveProduct(productIdOrSlug);
        wishlistRepository.deleteByUserIdAndProductId(userId, product.getId());
    }

    @Transactional(readOnly = true)
    public boolean isInWishlist(UUID userId, String productIdOrSlug) {
        Product product = resolveProduct(productIdOrSlug);
        return wishlistRepository.existsByUserIdAndProductId(userId, product.getId());
    }

    private Product resolveProduct(String productIdOrSlug) {
        try {
            UUID id = UUID.fromString(productIdOrSlug);
            return productRepository.findById(id)
                    .orElseThrow(() -> new ResourceNotFoundException("Product not found by ID: " + productIdOrSlug));
        } catch (IllegalArgumentException e) {
            return productRepository.findBySlug(productIdOrSlug)
                    .orElseThrow(() -> new ResourceNotFoundException("Product not found by Slug: " + productIdOrSlug));
        }
    }

    private WishlistItemResponse toResponse(Wishlist wishlist) {
        Product product = wishlist.getProduct();
        UUID storeId = product.getStoreId();
        Store store = storeId == null ? null : storeRepository.findById(storeId).orElse(null);

        return WishlistItemResponse.builder()
                .id(product.getId())
                .name(product.getName())
                .price(product.getEffectivePrice())
                .originalPrice(product.getBasePrice())
                .image(resolvePrimaryImageUrl(product))
                .storeId(storeId)
                .storeName(store != null ? store.getName() : null)
                .isOfficialStore(false)
                .build();
    }

    private String resolvePrimaryImageUrl(Product product) {
        if (product == null || product.getImages() == null || product.getImages().isEmpty()) {
            return null;
        }

        return product.getImages().stream()
                .filter(image -> image != null && image.getUrl() != null && !image.getUrl().isBlank())
                .sorted(Comparator
                        .comparing((ProductImage image) -> Boolean.TRUE.equals(image.getIsPrimary()) ? 0 : 1)
                        .thenComparing(
                                image -> image.getSortOrder() == null ? Integer.MAX_VALUE : image.getSortOrder()))
                .map(ProductImage::getUrl)
                .findFirst()
                .orElse(null);
    }
}
