package com.novamart.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class UserResponse {
    private Long id;
    private String email;
    private String roleType;
    private String gender;
    private String createdAt;
    private String status;
}
