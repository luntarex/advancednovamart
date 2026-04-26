package com.novamart.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "reviews")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false)
    private Integer starRating;

    @Column(columnDefinition = "TEXT")
    private String reviewText;

    @Column(length = 30)
    private String sentiment;

    private Integer helpfulVotes;

    @Column(columnDefinition = "TEXT")
    private String responseText;

    @Column(length = 20)
    private String visibility;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
