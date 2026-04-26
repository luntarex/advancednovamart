package com.novamart.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class AddressResponse {
    private Long id;
    private String addressLine;
    private String city;
    private String district;
    private String phone;
    private boolean isDefault;
    private LocalDateTime createdAt;
}
