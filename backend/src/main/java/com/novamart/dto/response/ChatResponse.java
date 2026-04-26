package com.novamart.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChatResponse {
    private String answer;
    private String visualizationCode;
}
