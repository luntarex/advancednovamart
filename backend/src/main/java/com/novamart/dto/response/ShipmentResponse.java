package com.novamart.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ShipmentResponse {
    private Long id;
    private Long orderId;
    private String warehouse;
    private String mode;
    private String trackingNumber;
    private String status;
    private String estimatedDelivery;
    private String lastUpdated;
}
