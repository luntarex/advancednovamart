package com.novamart.controller;

import com.novamart.dto.response.AnalyticsResponse;
import com.novamart.service.AnalyticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('CORPORATE', 'ADMIN')")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    @GetMapping("/sales-by-category")
    public ResponseEntity<List<AnalyticsResponse>> salesByCategory(
            Authentication authentication,
            @RequestParam(required = false) String range,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ResponseEntity.ok(analyticsService.getSalesByCategory(
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN"),
                range,
                startDate,
                endDate
        ));
    }

    @GetMapping("/revenue-trend")
    public ResponseEntity<List<AnalyticsResponse>> revenueTrend(
            Authentication authentication,
            @RequestParam(required = false) String range,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ResponseEntity.ok(analyticsService.getRevenueTrend(
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN"),
                range,
                startDate,
                endDate
        ));
    }

    @GetMapping("/top-products")
    public ResponseEntity<List<AnalyticsResponse>> topProducts(
            Authentication authentication,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(analyticsService.getTopProducts(
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN"),
                limit
        ));
    }

    @GetMapping("/customer-segments")
    public ResponseEntity<List<AnalyticsResponse>> customerSegments(Authentication authentication) {
        return ResponseEntity.ok(analyticsService.getCustomerSegments(
                getUserId(authentication),
                hasRole(authentication, "ROLE_ADMIN")
        ));
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
