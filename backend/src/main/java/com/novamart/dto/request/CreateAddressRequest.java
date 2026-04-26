package com.novamart.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateAddressRequest {

    @NotBlank
    private String addressLine;

    @NotBlank
    private String city;

    @NotBlank
    private String district;

    @NotBlank
    private String phone;
}
