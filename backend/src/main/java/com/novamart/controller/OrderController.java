package com.novamart.controller;

import com.novamart.dto.request.CreateOrderRequest;
import com.novamart.dto.request.CartItemRequest;
import com.novamart.dto.response.OrderResponse;
import com.novamart.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @GetMapping
    public ResponseEntity<List<OrderResponse>> getAll(Authentication authentication) {
        Long userId = getUserId(authentication);
        return ResponseEntity.ok(orderService.getAll(userId, hasRole(authentication, "ROLE_ADMIN")));
    }

    @GetMapping("/{id}")
    public ResponseEntity<OrderResponse> getById(@PathVariable Long id, Authentication authentication) {
        Long userId = getUserId(authentication);
        return ResponseEntity.ok(orderService.getById(id, userId, hasRole(authentication, "ROLE_ADMIN")));
    }

    @PostMapping
    public ResponseEntity<OrderResponse> create(@Valid @RequestBody CreateOrderRequest request,
                                                 Authentication authentication) {
        Long userId = getUserId(authentication);
        return ResponseEntity.ok(orderService.create(request, userId));
    }

    @GetMapping("/cart")
    public ResponseEntity<OrderResponse> getCart(Authentication authentication) {
        Long userId = getUserId(authentication);
        return ResponseEntity.ok(orderService.getCart(userId));
    }

    @GetMapping("/cart/count")
    public ResponseEntity<Map<String, Integer>> getCartCount(Authentication authentication) {
        Long userId = getUserId(authentication);
        return ResponseEntity.ok(Map.of("count", orderService.getCartCount(userId)));
    }

    @PostMapping("/cart/items")
    public ResponseEntity<OrderResponse> addCartItem(@Valid @RequestBody CartItemRequest request,
                                                     Authentication authentication) {
        Long userId = getUserId(authentication);
        return ResponseEntity.ok(orderService.addCartItem(userId, request));
    }

    @PostMapping("/cart/checkout")
    public ResponseEntity<OrderResponse> checkoutCart(Authentication authentication) {
        Long userId = getUserId(authentication);
        return ResponseEntity.ok(orderService.checkoutCart(userId));
    }

    @PutMapping("/cart/items/{productId}")
    public ResponseEntity<OrderResponse> updateCartItem(@PathVariable Long productId,
                                                        @RequestBody Map<String, Object> data,
                                                        Authentication authentication) {
        Long userId = getUserId(authentication);
        int quantity = data.get("quantity") instanceof Number number ? number.intValue() : 1;
        return ResponseEntity.ok(orderService.updateCartItem(userId, productId, quantity));
    }

    @DeleteMapping("/cart/items/{productId}")
    public ResponseEntity<OrderResponse> removeCartItem(@PathVariable Long productId,
                                                        Authentication authentication) {
        Long userId = getUserId(authentication);
        return ResponseEntity.ok(orderService.removeCartItem(userId, productId));
    }

    @DeleteMapping("/cart")
    public ResponseEntity<Void> clearCart(Authentication authentication) {
        Long userId = getUserId(authentication);
        orderService.clearCart(userId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<OrderResponse> update(@PathVariable Long id, @RequestBody Map<String, Object> data) {
        return ResponseEntity.ok(orderService.update(id, data));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        orderService.delete(id);
        return ResponseEntity.noContent().build();
    }

    private Long getUserId(Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof Long userId) {
            return userId;
        }
        if (principal instanceof String principalText) {
            return Long.parseLong(principalText);
        }
        throw new IllegalStateException("Unsupported authentication principal type");
    }

    private boolean hasRole(Authentication authentication, String role) {
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(role::equals);
    }
}
