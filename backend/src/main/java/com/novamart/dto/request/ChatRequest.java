package com.novamart.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ChatRequest {

    @NotBlank
    private String question;

    private String sessionId;

    private Long storeId;
}
