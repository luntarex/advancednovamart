package com.novamart.service;

import com.novamart.dto.request.CreateReviewRequest;
import com.novamart.dto.response.ReviewResponse;
import com.novamart.entity.Product;
import com.novamart.entity.Review;
import com.novamart.entity.User;
import com.novamart.exception.ResourceNotFoundException;
import com.novamart.repository.ProductRepository;
import com.novamart.repository.ReviewRepository;
import com.novamart.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final UserRepository userRepository;
    private final ProductRepository productRepository;

    public List<ReviewResponse> getAll(Long productId) {
        List<Review> reviews = productId != null
                ? reviewRepository.findByProductId(productId)
                : reviewRepository.findAll();
        return reviews.stream().map(this::toResponse).toList();
    }

    public ReviewResponse getById(Long id) {
        Review review = reviewRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Review", id));
        return toResponse(review);
    }

    public ReviewResponse create(CreateReviewRequest request, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        Product product = productRepository.findById(request.getProductId())
                .orElseThrow(() -> new ResourceNotFoundException("Product", request.getProductId()));

        Review review = Review.builder()
                .user(user)
                .product(product)
                .starRating(request.getStarRating())
                .reviewText(request.getReviewText())
                .sentiment(request.getSentiment())
                .helpfulVotes(0)
                .visibility("PUBLIC")
                .build();

        review = reviewRepository.save(review);
        return toResponse(review);
    }

    public ReviewResponse update(Long id, Map<String, Object> data) {
        Review review = reviewRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Review", id));

        if (data.containsKey("reviewText")) {
            review.setReviewText((String) data.get("reviewText"));
        }
        if (data.containsKey("starRating")) {
            review.setStarRating((Integer) data.get("starRating"));
        }
        if (data.containsKey("responseText")) {
            review.setResponseText((String) data.get("responseText"));
        }
        if (data.containsKey("visibility")) {
            review.setVisibility((String) data.get("visibility"));
        }

        review = reviewRepository.save(review);
        return toResponse(review);
    }

    public void delete(Long id) {
        if (!reviewRepository.existsById(id)) {
            throw new ResourceNotFoundException("Review", id);
        }
        reviewRepository.deleteById(id);
    }

    private ReviewResponse toResponse(Review review) {
        return ReviewResponse.builder()
                .id(review.getId())
                .userId(review.getUser().getId())
                .productId(review.getProduct().getId())
                .productTitle(review.getProduct().getName())
                .starRating(review.getStarRating())
                .reviewText(review.getReviewText())
                .sentiment(review.getSentiment())
                .helpfulVotes(review.getHelpfulVotes())
                .responseText(review.getResponseText())
                .visibility(review.getVisibility())
                .createdAt(review.getCreatedAt() != null ? review.getCreatedAt().toString() : null)
                .build();
    }
}
