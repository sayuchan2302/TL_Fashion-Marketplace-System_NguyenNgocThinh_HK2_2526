package vn.edu.hcmuaf.fit.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import vn.edu.hcmuaf.fit.marketplace.dto.response.WishlistItemResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.Product;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.entity.Wishlist;
import vn.edu.hcmuaf.fit.marketplace.exception.ResourceNotFoundException;
import vn.edu.hcmuaf.fit.marketplace.repository.ProductRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.WishlistRepository;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WishlistServiceTest {

    @Mock
    private WishlistRepository wishlistRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ProductRepository productRepository;
    @Mock
    private StoreRepository storeRepository;

    private WishlistService wishlistService;

    @BeforeEach
    void setUp() {
        wishlistService = new WishlistService(
                wishlistRepository,
                userRepository,
                productRepository,
                storeRepository);
    }

    @Test
    void getMyWishlistReturnsItemsSuccessfully() {
        UUID userId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID storeId = UUID.randomUUID();

        Product product = Product.builder()
                .id(productId)
                .name("Vintage Tee")
                .basePrice(new BigDecimal("150000"))
                .salePrice(new BigDecimal("120000"))
                .storeId(storeId)
                .images(new ArrayList<>())
                .build();

        Store store = Store.builder()
                .id(storeId)
                .name("Classic Store")
                .build();

        Wishlist wishlist = Wishlist.builder()
                .id(UUID.randomUUID())
                .product(product)
                .build();

        when(wishlistRepository.findByUserId(userId)).thenReturn(List.of(wishlist));
        when(storeRepository.findById(storeId)).thenReturn(Optional.of(store));

        List<WishlistItemResponse> response = wishlistService.getMyWishlist(userId);

        assertEquals(1, response.size());
        WishlistItemResponse item = response.get(0);
        assertEquals(productId, item.getId());
        assertEquals("Vintage Tee", item.getName());
        assertEquals(new BigDecimal("120000"), item.getPrice());
        assertEquals(new BigDecimal("150000"), item.getOriginalPrice());
        assertEquals("Classic Store", item.getStoreName());
    }

    @Test
    void addToWishlistSavesNewItemUsingUuidString() {
        UUID userId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        User user = User.builder().id(userId).email("user@example.com").build();
        Product product = Product.builder().id(productId).name("Jeans").build();

        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(wishlistRepository.existsByUserIdAndProductId(userId, productId)).thenReturn(false);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        wishlistService.addToWishlist(userId, productId.toString());

        verify(wishlistRepository, times(1)).save(any(Wishlist.class));
    }

    @Test
    void addToWishlistSavesNewItemUsingSlug() {
        UUID userId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        String slug = "gap-jeans";

        User user = User.builder().id(userId).email("user@example.com").build();
        Product product = Product.builder().id(productId).name("Jeans").slug(slug).build();

        when(productRepository.findBySlug(slug)).thenReturn(Optional.of(product));
        when(wishlistRepository.existsByUserIdAndProductId(userId, productId)).thenReturn(false);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        wishlistService.addToWishlist(userId, slug);

        verify(wishlistRepository, times(1)).save(any(Wishlist.class));
    }

    @Test
    void addToWishlistDoesNotSaveDuplicateIfAlreadyPresent() {
        UUID userId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Product product = Product.builder().id(productId).build();
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(wishlistRepository.existsByUserIdAndProductId(userId, productId)).thenReturn(true);

        wishlistService.addToWishlist(userId, productId.toString());

        verify(wishlistRepository, never()).save(any(Wishlist.class));
        verify(userRepository, never()).findById(any());
    }

    @Test
    void addToWishlistThrowsExceptionWhenUserNotFound() {
        UUID userId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Product product = Product.builder().id(productId).build();
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(wishlistRepository.existsByUserIdAndProductId(userId, productId)).thenReturn(false);
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> wishlistService.addToWishlist(userId, productId.toString()));
    }

    @Test
    void removeFromWishlistCallsDeleteDatabase() {
        UUID userId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Product product = Product.builder().id(productId).build();
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));

        wishlistService.removeFromWishlist(userId, productId.toString());

        verify(wishlistRepository, times(1)).deleteByUserIdAndProductId(userId, productId);
    }

    @Test
    void isInWishlistChecksExistence() {
        UUID userId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Product product = Product.builder().id(productId).build();
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(wishlistRepository.existsByUserIdAndProductId(userId, productId)).thenReturn(true);

        boolean result = wishlistService.isInWishlist(userId, productId.toString());

        assertTrue(result);
        verify(wishlistRepository, times(1)).existsByUserIdAndProductId(userId, productId);
    }
}
