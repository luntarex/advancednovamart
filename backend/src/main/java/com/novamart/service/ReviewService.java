package com.novamart.service;

import com.novamart.dto.request.CreateReviewRequest;
import com.novamart.dto.response.ReviewResponse;
import com.novamart.entity.Product;
import com.novamart.entity.Review;
import com.novamart.entity.User;
import com.novamart.exception.BadRequestException;
import com.novamart.exception.ResourceNotFoundException;
import com.novamart.repository.ProductRepository;
import com.novamart.repository.ReviewRepository;
import com.novamart.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
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
        return reviews.stream()
                .filter(this::isPublicReview)
                .map(this::toResponse)
                .toList();
    }

    public ReviewResponse getById(Long id) {
        Review review = reviewRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Review", id));
        if (!isPublicReview(review)) {
            throw new ResourceNotFoundException("Review", id);
        }
        return toResponse(review);
    }

    public ReviewResponse create(CreateReviewRequest request, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        Product product = productRepository.findById(request.getProductId())
                .orElseThrow(() -> new ResourceNotFoundException("Product", request.getProductId()));
        rejectUnsafeMarkup(request.getReviewText());
        rejectUnsafeMarkup(request.getSentiment());

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

    public ReviewResponse update(Long id, Map<String, Object> data, Long requesterUserId, boolean isAdmin) {
        Review review = reviewRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Review", id));

        boolean isReviewOwner = review.getUser() != null
                && requesterUserId != null
                && requesterUserId.equals(review.getUser().getId());
        boolean isStoreOwner = review.getProduct() != null
                && review.getProduct().getStore() != null
                && review.getProduct().getStore().getOwner() != null
                && requesterUserId != null
                && requesterUserId.equals(review.getProduct().getStore().getOwner().getId());

        if (!isAdmin && !isReviewOwner && !isStoreOwner) {
            throw new AccessDeniedException("You do not have access to this review");
        }
        if (!isAdmin && !isReviewOwner && (data.containsKey("reviewText") || data.containsKey("starRating"))) {
            throw new AccessDeniedException("Only the review owner can change review content");
        }
        if (!isAdmin && !isStoreOwner && data.containsKey("responseText")) {
            throw new AccessDeniedException("Only the store owner can respond to this review");
        }
        if (!isAdmin && data.containsKey("visibility")) {
            throw new AccessDeniedException("Only admins can change review visibility");
        }

        if (data.containsKey("reviewText")) {
            rejectUnsafeMarkup((String) data.get("reviewText"));
            review.setReviewText((String) data.get("reviewText"));
        }
        if (data.containsKey("starRating")) {
            review.setStarRating((Integer) data.get("starRating"));
        }
        if (data.containsKey("responseText")) {
            rejectUnsafeMarkup((String) data.get("responseText"));
            review.setResponseText((String) data.get("responseText"));
        }
        if (data.containsKey("visibility")) {
            review.setVisibility((String) data.get("visibility"));
        }

        review = reviewRepository.save(review);
        return toResponse(review);
    }

    private boolean isPublicReview(Review review) {
        return review.getVisibility() == null || "PUBLIC".equalsIgnoreCase(review.getVisibility());
    }

    private void rejectUnsafeMarkup(String value) {
        if (value == null) {
            return;
        }
        String normalized = value.toLowerCase(Locale.ROOT);
        if (normalized.matches(".*(<\\s*script|<\\s*img|<\\s*svg|javascript\\s*:|onerror\\s*=|onload\\s*=).*")) {
            throw new BadRequestException("Review text cannot contain executable HTML or JavaScript");
        }
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
