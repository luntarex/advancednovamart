package com.novamart.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class ProductResponse {
    private Long id;
    private String name;
    private String sku;
    private String description;
    private String imageUrl;
    private BigDecimal unitPrice;
    private Integer stockQuantity;
    private Long categoryId;
    private String categoryName;
    private Long storeId;
}
