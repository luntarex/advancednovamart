package com.novamart.controller;

import com.novamart.dto.response.ShipmentResponse;
import com.novamart.service.ShipmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/shipments")
@RequiredArgsConstructor
public class ShipmentController {

    private final ShipmentService shipmentService;

    @GetMapping
    public ResponseEntity<List<ShipmentResponse>> getAll(Authentication authentication) {
        return ResponseEntity.ok(shipmentService.getAll(
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN")
        ));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ShipmentResponse> getById(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(shipmentService.getById(
                id,
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN")
        ));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'CORPORATE')")
    public ResponseEntity<ShipmentResponse> create(@RequestBody Map<String, Object> data,
                                                   Authentication authentication) {
        return ResponseEntity.ok(shipmentService.create(
                data,
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN")
        ));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'CORPORATE')")
    public ResponseEntity<ShipmentResponse> update(@PathVariable Long id,
                                                   @RequestBody Map<String, Object> data,
                                                   Authentication authentication) {
        return ResponseEntity.ok(shipmentService.update(
                id,
                data,
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN")
        ));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        shipmentService.delete(id);
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
