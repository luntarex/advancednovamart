package com.novamart.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class StoreResponse {
    private Long id;
    private String name;
    private Long ownerId;
    private String status;
    private String createdAt;
}
