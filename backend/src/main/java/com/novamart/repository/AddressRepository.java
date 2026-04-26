package com.novamart.repository;

import com.novamart.entity.Address;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AddressRepository extends JpaRepository<Address, Long> {

    List<Address> findByUserIdOrderByIsDefaultDescCreatedAtDesc(Long userId);
    Optional<Address> findByIdAndUserId(Long id, Long userId);
    Optional<Address> findFirstByUserIdOrderByCreatedAtDesc(Long userId);
    long countByUserId(Long userId);

    @Modifying
    @Query("update Address a set a.isDefault = false where a.user.id = :userId")
    int clearDefaultByUserId(@Param("userId") Long userId);
}
