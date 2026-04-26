package com.novamart.config;

import com.novamart.entity.Product;
import com.novamart.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Component
@Order(Ordered.LOWEST_PRECEDENCE - 1)
@RequiredArgsConstructor
@Slf4j
public class ProductImageUrlSeeder implements CommandLineRunner {

    private static final int IMAGE_WIDTH = 960;
    private static final int IMAGE_HEIGHT = 640;

    private final ProductRepository productRepository;

    @Override
    @Transactional
    public void run(String... args) {
        List<Product> products = productRepository.findAll();
        if (products.isEmpty()) {
            return;
        }

        int updated = 0;
        for (Product product : products) {
            if (hasText(product.getImageUrl())) {
                continue;
            }
            product.setImageUrl(buildRandomImageUrl(product));
            updated++;
        }

        if (updated > 0) {
            productRepository.saveAll(products);
            log.info("ProductImageUrlSeeder assigned image URLs to {} products.", updated);
        }
    }

    private String buildRandomImageUrl(Product product) {
        long idSeed = product.getId() != null ? product.getId() : ThreadLocalRandom.current().nextLong(1, 10_000);
        int randomSeed = ThreadLocalRandom.current().nextInt(100, 999);
        String seed = "novamart-" + idSeed + "-" + randomSeed;
        return "https://picsum.photos/seed/" + seed + "/" + IMAGE_WIDTH + "/" + IMAGE_HEIGHT;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
