package com.novamart.repository;

import com.novamart.entity.Store;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StoreRepository extends JpaRepository<Store, Long> {

    List<Store> findByOwnerId(Long ownerId);
}
