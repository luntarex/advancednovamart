package com.novamart.controller;

import com.novamart.dto.request.CreateProductRequest;
import com.novamart.dto.response.ProductResponse;
import com.novamart.service.ProductService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    @GetMapping
    public ResponseEntity<List<ProductResponse>> getAll(Authentication authentication) {
        Long userId = getUserId(authentication);
        return ResponseEntity.ok(productService.getAll(userId, hasRole(authentication, "ROLE_ADMIN")));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(productService.getById(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('CORPORATE')")
    public ResponseEntity<ProductResponse> create(@Valid @RequestBody CreateProductRequest request,
                                                  Authentication authentication) {
        return ResponseEntity.ok(productService.create(request, getUserId(authentication)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('CORPORATE', 'ADMIN')")
    public ResponseEntity<ProductResponse> update(@PathVariable Long id,
                                                  @Valid @RequestBody CreateProductRequest request,
                                                  Authentication authentication) {
        return ResponseEntity.ok(productService.update(
                id,
                request,
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN")
        ));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('CORPORATE', 'ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication authentication) {
        productService.delete(id, getUserId(authentication), hasRole(authentication, "ROLE_ADMIN"));
        return ResponseEntity.noContent().build();
    }

    private Long getUserId(Authentication authentication) {
        if (authentication == null) {
            return null;
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof Long userId) {
            return userId;
        }
        if (principal instanceof String principalText) {
            return Long.parseLong(principalText);
        }
        return null;
    }

    private boolean hasRole(Authentication authentication, String role) {
        if (authentication == null) {
            return false;
        }
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(role::equals);
    }
}
