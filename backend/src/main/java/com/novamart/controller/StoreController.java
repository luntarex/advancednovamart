package com.novamart.controller;

import com.novamart.dto.request.CreateStoreRequest;
import com.novamart.dto.response.StoreResponse;
import com.novamart.service.StoreService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/stores")
@RequiredArgsConstructor
public class StoreController {

    private final StoreService storeService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'CORPORATE')")
    public ResponseEntity<List<StoreResponse>> getAll(Authentication authentication) {
        return ResponseEntity.ok(storeService.getAll(
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN")
        ));
    }

    @GetMapping("/{id}")
    public ResponseEntity<StoreResponse> getById(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(storeService.getById(
                id,
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN")
        ));
    }

    @PostMapping
    @PreAuthorize("hasRole('CORPORATE')")
    public ResponseEntity<StoreResponse> create(@Valid @RequestBody CreateStoreRequest request,
                                                 Authentication authentication) {
        Long ownerId = getUserId(authentication);
        return ResponseEntity.ok(storeService.create(request, ownerId));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'CORPORATE')")
    public ResponseEntity<StoreResponse> update(@PathVariable Long id,
                                                @RequestBody Map<String, Object> data,
                                                Authentication authentication) {
        return ResponseEntity.ok(storeService.update(
                id,
                data,
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN")
        ));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        storeService.delete(id);
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
                .anyMatch(authority -> role.equals(authority.getAuthority()));
    }
}
