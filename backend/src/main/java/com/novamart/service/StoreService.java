package com.novamart.service;

import com.novamart.dto.request.CreateStoreRequest;
import com.novamart.dto.response.StoreResponse;
import com.novamart.entity.Store;
import com.novamart.entity.User;
import com.novamart.enums.StoreStatus;
import com.novamart.exception.ResourceNotFoundException;
import com.novamart.repository.StoreRepository;
import com.novamart.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class StoreService {

    private final StoreRepository storeRepository;
    private final UserRepository userRepository;

    public List<StoreResponse> getAll() {
        return storeRepository.findAll().stream().map(this::toResponse).toList();
    }

    public StoreResponse getById(Long id) {
        Store store = storeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Store", id));
        return toResponse(store);
    }

    public List<StoreResponse> getByOwnerId(Long ownerId) {
        return storeRepository.findByOwnerId(ownerId).stream().map(this::toResponse).toList();
    }

    public StoreResponse create(CreateStoreRequest request, Long ownerId) {
        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("User", ownerId));

        Store store = Store.builder()
                .name(request.getName())
                .owner(owner)
                .status(StoreStatus.PENDING_APPROVAL)
                .build();

        store = storeRepository.save(store);
        return toResponse(store);
    }

    public StoreResponse update(Long id, Map<String, Object> data) {
        Store store = storeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Store", id));

        if (data.containsKey("name")) {
            store.setName((String) data.get("name"));
        }
        if (data.containsKey("status")) {
            try {
                store.setStatus(StoreStatus.valueOf(((String) data.get("status")).toUpperCase()));
            } catch (IllegalArgumentException ignored) {}
        }

        store = storeRepository.save(store);
        return toResponse(store);
    }

    public void delete(Long id) {
        if (!storeRepository.existsById(id)) {
            throw new ResourceNotFoundException("Store", id);
        }
        storeRepository.deleteById(id);
    }

    private StoreResponse toResponse(Store store) {
        return StoreResponse.builder()
                .id(store.getId())
                .name(store.getName())
                .ownerId(store.getOwner().getId())
                .status(store.getStatus().name())
                .createdAt(store.getCreatedAt() != null ? store.getCreatedAt().toString() : null)
                .build();
    }
}
