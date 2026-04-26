package com.novamart.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "addresses")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Address {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String addressLine;

    @Column(nullable = false, length = 60)
    private String city;

    @Column(length = 60)
    private String district;

    @Column(length = 20)
    private String phone;

    @Column(nullable = false)
    private boolean isDefault;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
