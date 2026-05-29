package vn.edu.hcmuaf.fit.marketplace.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import vn.edu.hcmuaf.fit.marketplace.dto.response.WishlistItemResponse;
import vn.edu.hcmuaf.fit.marketplace.security.JwtService;
import vn.edu.hcmuaf.fit.marketplace.service.WishlistService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/wishlist")
public class WishlistController {

    private final WishlistService wishlistService;
    private final JwtService jwtService;

    public WishlistController(WishlistService wishlistService, JwtService jwtService) {
        this.wishlistService = wishlistService;
        this.jwtService = jwtService;
    }

    @GetMapping
    public ResponseEntity<List<WishlistItemResponse>> getMyWishlist(@RequestHeader("Authorization") String authHeader) {
        UUID userId = getUserId(authHeader);
        return ResponseEntity.ok(wishlistService.getMyWishlist(userId));
    }

    @PostMapping("/{productIdOrSlug}")
    public ResponseEntity<Void> addToWishlist(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String productIdOrSlug) {
        UUID userId = getUserId(authHeader);
        wishlistService.addToWishlist(userId, productIdOrSlug);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{productIdOrSlug}")
    public ResponseEntity<Void> removeFromWishlist(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String productIdOrSlug) {
        UUID userId = getUserId(authHeader);
        wishlistService.removeFromWishlist(userId, productIdOrSlug);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/check/{productIdOrSlug}")
    public ResponseEntity<Boolean> isInWishlist(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String productIdOrSlug) {
        UUID userId = getUserId(authHeader);
        return ResponseEntity.ok(wishlistService.isInWishlist(userId, productIdOrSlug));
    }

    private UUID getUserId(String authHeader) {
        String token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
        String userIdStr = jwtService.extractUserId(token.trim());
        return UUID.fromString(userIdStr);
    }
}
