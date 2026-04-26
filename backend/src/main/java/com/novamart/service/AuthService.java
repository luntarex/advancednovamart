package com.novamart.service;

import com.novamart.dto.request.LoginRequest;
import com.novamart.dto.request.RegisterRequest;
import com.novamart.dto.response.AuthResponse;
import com.novamart.entity.User;
import com.novamart.enums.RoleType;
import com.novamart.exception.BadRequestException;
import com.novamart.repository.UserRepository;
import com.novamart.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadRequestException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BadRequestException("Invalid email or password");
        }

        String token = tokenProvider.generateToken(user.getId(), user.getRoleType().name());
        return new AuthResponse(token);
    }

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already in use");
        }

        RoleType role = RoleType.INDIVIDUAL;
        if (request.getRoleType() != null) {
            try {
                role = RoleType.valueOf(request.getRoleType().toUpperCase());
            } catch (IllegalArgumentException ignored) {
                // Default to INDIVIDUAL
            }
        }

        User user = User.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .roleType(role)
                .gender(request.getGender())
                .build();

        user = userRepository.save(user);
        String token = tokenProvider.generateToken(user.getId(), user.getRoleType().name());
        return new AuthResponse(token);
    }
}
