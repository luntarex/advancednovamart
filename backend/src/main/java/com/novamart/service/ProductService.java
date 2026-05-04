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
import org.springframework.security.access.AccessDeniedException;
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

    public ProductResponse create(CreateProductRequest request, Long requesterUserId) {
        Store store = resolveOwnedStore(request.getStoreId(), requesterUserId);
        Product product = Product.builder()
                .name(request.getName())
                .sku(request.getSku())
                .description(request.getDescription())
                .imageUrl(request.getImageUrl())
                .unitPrice(request.getUnitPrice())
                .stockQuantity(request.getStockQuantity())
                .store(store)
                .build();

        if (request.getCategoryId() != null) {
            product.setCategory(categoryRepository.findById(request.getCategoryId()).orElse(null));
        }

        product = productRepository.save(product);
        return toResponse(product);
    }

    public ProductResponse update(Long id, CreateProductRequest request, Long requesterUserId, boolean isAdmin) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product", id));
        if (!isAdmin && !ownsProductStore(product, requesterUserId)) {
            throw new AccessDeniedException("You do not have access to this product");
        }

        product.setName(request.getName());
        product.setSku(request.getSku());
        product.setDescription(request.getDescription());
        product.setImageUrl(request.getImageUrl());
        product.setUnitPrice(request.getUnitPrice());
        product.setStockQuantity(request.getStockQuantity());
        if (request.getCategoryId() != null) {
            product.setCategory(categoryRepository.findById(request.getCategoryId()).orElse(null));
        }
        if (request.getStoreId() != null) {
            Store targetStore = isAdmin
                    ? storeRepository.findById(request.getStoreId())
                            .orElseThrow(() -> new ResourceNotFoundException("Store", request.getStoreId()))
                    : resolveOwnedStore(request.getStoreId(), requesterUserId);
            product.setStore(targetStore);
        }

        product = productRepository.save(product);
        return toResponse(product);
    }

    public void delete(Long id, Long requesterUserId, boolean isAdmin) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product", id));
        if (!isAdmin && !ownsProductStore(product, requesterUserId)) {
            throw new AccessDeniedException("You do not have access to this product");
        }
        productRepository.delete(product);
    }

    private Store resolveOwnedStore(Long storeId, Long requesterUserId) {
        if (storeId == null) {
            List<Store> ownedStores = requesterUserId == null ? List.of() : storeRepository.findByOwnerId(requesterUserId);
            if (ownedStores.size() == 1) {
                return ownedStores.get(0);
            }
            throw new AccessDeniedException("Products must be assigned to a store you own");
        }
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new ResourceNotFoundException("Store", storeId));
        if (store.getOwner() == null || requesterUserId == null || !requesterUserId.equals(store.getOwner().getId())) {
            throw new AccessDeniedException("You do not have access to this store");
        }
        return store;
    }

    private boolean ownsProductStore(Product product, Long requesterUserId) {
        return product.getStore() != null
                && product.getStore().getOwner() != null
                && requesterUserId != null
                && requesterUserId.equals(product.getStore().getOwner().getId());
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
