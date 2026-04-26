package com.novamart.repository;

import com.novamart.entity.CustomerProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CustomerProfileRepository extends JpaRepository<CustomerProfile, Long> {

    Optional<CustomerProfile> findByUserId(Long userId);

    List<CustomerProfile> findByUserIdIn(List<Long> userIds);
}
