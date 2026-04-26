package com.novamart.service;

import com.novamart.dto.response.CategoryResponse;
import com.novamart.entity.Category;
import com.novamart.exception.ResourceNotFoundException;
import com.novamart.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;

    public List<CategoryResponse> getAll() {
        return categoryRepository.findAll().stream().map(this::toResponse).toList();
    }

    public CategoryResponse getById(Long id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category", id));
        return toResponse(category);
    }

    public CategoryResponse create(Map<String, Object> data) {
        Category category = Category.builder()
                .name((String) data.get("name"))
                .build();

        if (data.containsKey("parentId") && data.get("parentId") != null) {
            Long parentId = Long.valueOf(data.get("parentId").toString());
            category.setParent(categoryRepository.findById(parentId).orElse(null));
        }

        category = categoryRepository.save(category);
        return toResponse(category);
    }

    public CategoryResponse update(Long id, Map<String, Object> data) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category", id));

        if (data.containsKey("name")) {
            category.setName((String) data.get("name"));
        }

        category = categoryRepository.save(category);
        return toResponse(category);
    }

    public void delete(Long id) {
        if (!categoryRepository.existsById(id)) {
            throw new ResourceNotFoundException("Category", id);
        }
        categoryRepository.deleteById(id);
    }

    private CategoryResponse toResponse(Category category) {
        return CategoryResponse.builder()
                .id(category.getId())
                .name(category.getName())
                .parentId(category.getParent() != null ? category.getParent().getId() : null)
                .build();
    }
}
