package com.novamart.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class CreateProductRequest {

    @NotBlank
    private String name;

    @NotBlank
    private String sku;

    private String description;
    private String imageUrl;

    @NotNull
    @Min(0)
    private BigDecimal unitPrice;

    @NotNull
    @Min(0)
    private Integer stockQuantity;

    private Long categoryId;

    private Long storeId;
}
