package com.novamart.service;

import com.novamart.dto.request.CreateProductRequest;
import com.novamart.dto.response.ProductResponse;
import com.novamart.entity.Product;
import com.novamart.entity.Store;
import com.novamart.exception.ResourceNotFoundException;
import com.novamart.repository.CategoryRepository;
import com.novamart.repository.ProductRepository;
import com.novamart.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final StoreRepository storeRepository;

    public List<ProductResponse> getAll(Long requesterUserId, boolean isAdmin) {
        List<Product> products;
        if (isAdmin || requesterUserId == null) {
            products = productRepository.findAll();
        } else {
            List<Long> ownedStoreIds = storeRepository.findByOwnerId(requesterUserId).stream()
                    .map(Store::getId)
                    .toList();
            if (!ownedStoreIds.isEmpty()) {
                products = productRepository.findByStoreIdIn(ownedStoreIds);
            } else {
                products = productRepository.findAll();
            }
        }
        return products.stream().map(this::toResponse).toList();
    }

    public ProductResponse getById(Long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product", id));
        return toResponse(product);
    }

    public ProductResponse create(CreateProductRequest request) {
        Product product = Product.builder()
                .name(request.getName())
                .sku(request.getSku())
                .description(request.getDescription())
                .imageUrl(request.getImageUrl())
                .unitPrice(request.getUnitPrice())
                .stockQuantity(request.getStockQuantity())
                .build();

        if (request.getCategoryId() != null) {
            product.setCategory(categoryRepository.findById(request.getCategoryId()).orElse(null));
        }
        if (request.getStoreId() != null) {
            product.setStore(storeRepository.findById(request.getStoreId()).orElse(null));
        }

        product = productRepository.save(product);
        return toResponse(product);
    }

    public ProductResponse update(Long id, CreateProductRequest request) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product", id));

        product.setName(request.getName());
        product.setSku(request.getSku());
        product.setDescription(request.getDescription());
        product.setImageUrl(request.getImageUrl());
        product.setUnitPrice(request.getUnitPrice());
        product.setStockQuantity(request.getStockQuantity());

        product = productRepository.save(product);
        return toResponse(product);
    }

    public void delete(Long id) {
        if (!productRepository.existsById(id)) {
            throw new ResourceNotFoundException("Product", id);
        }
        productRepository.deleteById(id);
    }

    private ProductResponse toResponse(Product product) {
        return ProductResponse.builder()
                .id(product.getId())
                .name(product.getName())
                .sku(product.getSku())
                .description(product.getDescription())
                .imageUrl(product.getImageUrl())
                .unitPrice(product.getUnitPrice())
                .stockQuantity(product.getStockQuantity())
                .categoryId(product.getCategory() != null ? product.getCategory().getId() : null)
                .categoryName(product.getCategory() != null ? product.getCategory().getName() : null)
                .storeId(product.getStore() != null ? product.getStore().getId() : null)
                .build();
    }
}
