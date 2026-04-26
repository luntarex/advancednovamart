package com.novamart.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ReviewResponse {
    private Long id;
    private Long userId;
    private Long productId;
    private String productTitle;
    private Integer starRating;
    private String reviewText;
    private String sentiment;
    private Integer helpfulVotes;
    private String responseText;
    private String visibility;
    private String createdAt;
}
