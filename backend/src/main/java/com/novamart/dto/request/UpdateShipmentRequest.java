package com.novamart.dto.request;

import lombok.Data;

@Data
public class UpdateShipmentRequest {

    private String status;

    private String warehouse;

    private String mode;

    private String trackingNumber;
}
