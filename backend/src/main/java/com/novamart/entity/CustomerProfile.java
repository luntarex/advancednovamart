package com.novamart.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "customer_profiles")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CustomerProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    private Integer age;

    private String city;

    @Column(length = 30)
    private String membershipType;

    private Double totalSpend;

    private Integer itemsPurchased;

    private Double avgRating;

    private Boolean discountApplied;

    @Column(length = 30)
    private String satisfactionLevel;
}
