package com.novamart.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateStoreRequest {

    @NotBlank
    private String name;
}
