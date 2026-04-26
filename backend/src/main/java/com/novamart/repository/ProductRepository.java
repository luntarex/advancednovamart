package com.novamart.repository;

import com.novamart.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;

import java.math.BigDecimal;
import java.util.List;

public interface ProductRepository extends JpaRepository<Product, Long> {

    List<Product> findByStoreId(Long storeId);

    List<Product> findByStoreIdIn(List<Long> storeIds);

    List<Product> findByCategoryId(Long categoryId);

    List<Product> findByUnitPriceLessThanEqual(BigDecimal price);
}
