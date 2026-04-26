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

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;

@Component
@Order(Ordered.LOWEST_PRECEDENCE)
@RequiredArgsConstructor
@Slf4j
public class ProductPriceNormalizerSeeder implements CommandLineRunner {

    private final ProductRepository productRepository;

    @Override
    @Transactional
    public void run(String... args) {
        List<Product> placeholders = productRepository.findByUnitPriceLessThanEqual(BigDecimal.ONE);
        if (placeholders.isEmpty()) {
            return;
        }

        for (Product product : placeholders) {
            BigDecimal normalized = estimatePrice(product);
            product.setUnitPrice(normalized);
        }

        productRepository.saveAll(placeholders);
        log.info("ProductPriceNormalizerSeeder updated {} placeholder-priced products.", placeholders.size());
    }

    private BigDecimal estimatePrice(Product product) {
        long idSeed = product.getId() != null ? product.getId() : 1L;
        long tier = idSeed % 7;

        String categoryName = product.getCategory() != null && product.getCategory().getName() != null
                ? product.getCategory().getName().toLowerCase(Locale.ROOT)
                : "";

        BigDecimal base;
        BigDecimal step;

        if (categoryName.contains("electronics") || categoryName.contains("computer") || categoryName.contains("wireless")) {
            base = BigDecimal.valueOf(1999);
            step = BigDecimal.valueOf(550);
        } else if (categoryName.contains("fashion") || categoryName.contains("apparel") || categoryName.contains("clothing")) {
            base = BigDecimal.valueOf(499);
            step = BigDecimal.valueOf(120);
        } else if (categoryName.contains("home") || categoryName.contains("kitchen")) {
            base = BigDecimal.valueOf(799);
            step = BigDecimal.valueOf(180);
        } else if (categoryName.contains("beauty") || categoryName.contains("personal")) {
            base = BigDecimal.valueOf(299);
            step = BigDecimal.valueOf(90);
        } else {
            base = BigDecimal.valueOf(649);
            step = BigDecimal.valueOf(130);
        }

        return base.add(step.multiply(BigDecimal.valueOf(tier))).setScale(2, RoundingMode.HALF_UP);
    }
}
