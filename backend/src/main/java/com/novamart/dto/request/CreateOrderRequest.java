package com.novamart.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class CreateOrderRequest {

    @NotNull
    private Long storeId;

    private String paymentMethod;

    private List<OrderItemRequest> items;

    @Data
    public static class OrderItemRequest {

        @NotNull
        private Long productId;

        @NotNull
        @Min(1)
        private Integer quantity;
    }
}
