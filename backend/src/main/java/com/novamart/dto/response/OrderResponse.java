package com.novamart.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
public class OrderResponse {
    private Long id;
    private Long userId;
    private Long storeId;
    private String status;
    private BigDecimal grandTotal;
    private String paymentMethod;
    private String orderDate;
    private List<OrderItemResponse> items;
}
