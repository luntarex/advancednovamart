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
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@Order(Ordered.LOWEST_PRECEDENCE - 2)
@RequiredArgsConstructor
@Slf4j
public class ProductNameNormalizerSeeder implements CommandLineRunner {

    private static final Pattern CODE_LIKE_PATTERN = Pattern.compile("^[A-Z0-9\\-_/\\.]{6,}$");
    private static final Pattern SIZE_PATTERN = Pattern.compile("(XXXL|XXL|XL|L|M|S|XS)$");

    private final ProductRepository productRepository;

    @Override
    @Transactional
    public void run(String... args) {
        List<Product> products = productRepository.findAll();
        if (products.isEmpty()) {
            return;
        }

        int renamed = 0;
        for (Product product : products) {
            String currentName = safe(product.getName());
            if (!isCodeLikeName(currentName, safe(product.getSku()))) {
                continue;
            }

            String generatedName = buildReadableName(product);
            if (!generatedName.equals(currentName)) {
                product.setName(generatedName);
                renamed++;
            }

            String currentDescription = safe(product.getDescription());
            if (currentDescription.isBlank() || isCodeLikeName(currentDescription, safe(product.getSku())) || currentDescription.equals(currentName)) {
                product.setDescription(generatedName + " by NovaMart.");
            }
        }

        if (renamed > 0) {
            productRepository.saveAll(products);
            log.info("ProductNameNormalizerSeeder updated {} product names.", renamed);
        }
    }

    private boolean isCodeLikeName(String name, String sku) {
        if (name.isBlank()) {
            return true;
        }

        String normalized = name.trim().toUpperCase(Locale.ROOT);
        if (normalized.contains(" ")) {
            return false;
        }

        if (CODE_LIKE_PATTERN.matcher(normalized).matches()) {
            return true;
        }

        String skuBase = sku.replaceAll("_S\\d+$", "");
        return !skuBase.isBlank() && normalized.equalsIgnoreCase(skuBase);
    }

    private String buildReadableName(Product product) {
        String category = product.getCategory() != null && product.getCategory().getName() != null
                ? product.getCategory().getName().toLowerCase(Locale.ROOT)
                : "";

        String[] options;
        if (category.contains("fashion") || category.contains("apparel") || category.contains("clothing")) {
            options = new String[]{
                    "Performance Hoodie",
                    "Urban Fit Sweatshirt",
                    "Comfort Track Pants",
                    "Daily Wear T-Shirt",
                    "Activewear Jacket",
                    "Classic Polo Shirt"
            };
        } else if (category.contains("home") || category.contains("kitchen")) {
            options = new String[]{
                    "Smart Air Purifier",
                    "Compact Coffee Maker",
                    "Ceramic Cookware Set",
                    "Foldable Laundry Rack",
                    "Modern Table Lamp",
                    "Multiuse Storage Box"
            };
        } else if (category.contains("electronics") || category.contains("computer") || category.contains("wireless")) {
            options = new String[]{
                    "Wireless Earbuds Pro",
                    "Mechanical Keyboard",
                    "Portable Bluetooth Speaker",
                    "Full HD Monitor",
                    "Gaming Mouse",
                    "Fast Charge Power Bank"
            };
        } else {
            options = new String[]{
                    "Top Seller Product",
                    "Daily Essentials Item",
                    "Customer Favorite Choice",
                    "Popular Marketplace Pick",
                    "Everyday Value Product",
                    "Premium Quality Item"
            };
        }

        long idSeed = product.getId() != null ? product.getId() : 1L;
        int index = Math.abs(Objects.hash(idSeed, safe(product.getSku()))) % options.length;
        String baseName = options[index];

        String size = extractSizeToken(safe(product.getSku()), safe(product.getName()));
        if (!size.isBlank() && !baseName.toUpperCase(Locale.ROOT).endsWith(" " + size)) {
            return baseName + " " + size;
        }

        return baseName;
    }

    private String extractSizeToken(String sku, String currentName) {
        Matcher skuMatcher = SIZE_PATTERN.matcher(sku.toUpperCase(Locale.ROOT));
        if (skuMatcher.find()) {
            return skuMatcher.group(1);
        }

        Matcher nameMatcher = SIZE_PATTERN.matcher(currentName.toUpperCase(Locale.ROOT));
        if (nameMatcher.find()) {
            return nameMatcher.group(1);
        }

        return "";
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
