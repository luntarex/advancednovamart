package com.novamart.repository;

import com.novamart.entity.Order;
import com.novamart.enums.OrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {

    List<Order> findByUserId(Long userId);

    List<Order> findByStoreId(Long storeId);

    List<Order> findByStoreIdIn(List<Long> storeIds);

    Optional<Order> findByUserIdAndStatus(Long userId, OrderStatus status);
}
