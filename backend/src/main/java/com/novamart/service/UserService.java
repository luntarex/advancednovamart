package com.novamart.service;

import com.novamart.dto.request.CreateUserRequest;
import com.novamart.dto.response.UserResponse;
import com.novamart.entity.User;
import com.novamart.enums.RoleType;
import com.novamart.exception.BadRequestException;
import com.novamart.exception.ResourceNotFoundException;
import com.novamart.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public List<UserResponse> getAll() {
        return userRepository.findAll().stream().map(this::toResponse).toList();
    }

    public UserResponse getById(Long id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        return toResponse(user);
    }

    public UserResponse create(CreateUserRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already in use");
        }

        RoleType role = RoleType.INDIVIDUAL;
        if (request.getRoleType() != null) {
            try {
                role = RoleType.valueOf(request.getRoleType().toUpperCase());
            } catch (IllegalArgumentException ignored) {}
        }

        User user = User.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode("changeme123"))
                .roleType(role)
                .build();

        user = userRepository.save(user);
        return toResponse(user);
    }

    @SuppressWarnings("unchecked")
    public UserResponse update(Long id, Map<String, Object> data) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));

        if (data.containsKey("email")) {
            user.setEmail((String) data.get("email"));
        }
        if (data.containsKey("gender")) {
            user.setGender((String) data.get("gender"));
        }
        if (data.containsKey("roleType")) {
            try {
                user.setRoleType(RoleType.valueOf(((String) data.get("roleType")).toUpperCase()));
            } catch (IllegalArgumentException ignored) {}
        }

        user = userRepository.save(user);
        return toResponse(user);
    }

    public void delete(Long id) {
        if (!userRepository.existsById(id)) {
            throw new ResourceNotFoundException("User", id);
        }
        userRepository.deleteById(id);
    }

    private UserResponse toResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .roleType(user.getRoleType().name())
                .gender(user.getGender())
                .createdAt(user.getCreatedAt() != null ? user.getCreatedAt().toString() : null)
                .status("ACTIVE")
                .build();
    }
}
