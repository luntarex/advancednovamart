package com.novamart.controller;

import com.novamart.dto.request.CreateAddressRequest;
import com.novamart.dto.response.AddressResponse;
import com.novamart.service.AddressService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/addresses")
@RequiredArgsConstructor
public class AddressController {

    private final AddressService addressService;

    @GetMapping
    public ResponseEntity<List<AddressResponse>> getUserAddresses(Authentication authentication) {
        return ResponseEntity.ok(addressService.getUserAddresses(getUserId(authentication)));
    }

    @PostMapping
    public ResponseEntity<AddressResponse> createAddress(
            Authentication authentication,
            @Valid @RequestBody CreateAddressRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(addressService.createAddress(getUserId(authentication), request));
    }

    @PutMapping("/{id}/default")
    public ResponseEntity<AddressResponse> setDefaultAddress(
            Authentication authentication,
            @PathVariable Long id) {
        return ResponseEntity.ok(addressService.setDefaultAddress(getUserId(authentication), id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAddress(
            Authentication authentication,
            @PathVariable Long id) {
        addressService.deleteAddress(getUserId(authentication), id);
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
}
