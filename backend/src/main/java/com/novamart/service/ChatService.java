package com.novamart.service;

import com.novamart.dto.request.ChatRequest;
import com.novamart.dto.response.ChatResponse;
import com.novamart.entity.Store;
import com.novamart.entity.User;
import com.novamart.repository.StoreRepository;
import com.novamart.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ChatService {

    private static final String PYTHON_CHATBOT_URL = "http://localhost:8000/ask";
    private final UserRepository userRepository;
    private final StoreRepository storeRepository;

    /**
     * Forwards the chat question to the Python LangGraph service
     * and returns the response to the Angular frontend.
     */
    public ChatResponse ask(ChatRequest request, Authentication authentication) {
        try {
            RestTemplate restTemplate = new RestTemplate();
            Long userId = getUserId(authentication);
            String role = resolveRole(authentication, userId);
            List<Long> allowedStoreIds = resolveAllowedStoreIds(role, userId);
            Long activeStoreId = resolveActiveStoreId(request, allowedStoreIds);

            // Build the request body for the Python service
            Map<String, Object> body = new HashMap<>();
            body.put("question", request.getQuestion());
            body.put("session_id", request.getSessionId());
            body.put("user_id", userId);
            body.put("role", role);
            body.put("active_store_id", activeStoreId);
            body.put("allowed_store_ids", allowedStoreIds);

            // Call the Python FastAPI service
            @SuppressWarnings("unchecked")
            Map<String, Object> result = restTemplate.postForObject(
                    PYTHON_CHATBOT_URL, body, Map.class
            );

            if (result != null) {
                return ChatResponse.builder()
                        .answer(String.valueOf(result.getOrDefault(
                                "answer",
                                "Chatbot şu anda yanıt üretemedi. Lütfen biraz sonra tekrar deneyin."
                        )))
                        .visualizationCode(String.valueOf(result.getOrDefault("visualization_code", "")))
                        .sqlQuery(String.valueOf(result.getOrDefault("sql_query", "")))
                        .blockedReason(String.valueOf(result.getOrDefault("blocked_reason", "")))
                        .build();
            }

        } catch (Exception e) {
            // If Python service is down, return a friendly error
            return ChatResponse.builder()
                    .answer("Chatbot servisine şu anda ulaşılamıyor. Lütfen Python chatbot servisinin çalıştığından emin olup tekrar deneyin.")
                    .blockedReason("spring_proxy_error")
                    .build();
        }

        return ChatResponse.builder()
                .answer("Chatbot şu anda sorunuzu işleyemedi. Lütfen biraz sonra tekrar deneyin.")
                .build();
    }

    private Long getUserId(Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof Long userId) {
            return userId;
        }
        if (principal instanceof String principalText) {
            return Long.parseLong(principalText);
        }
        throw new IllegalStateException("Unsupported authentication principal type");
    }

    private String resolveRole(Authentication authentication, Long userId) {
        if (authentication != null && authentication.getAuthorities() != null) {
            for (GrantedAuthority authority : authentication.getAuthorities()) {
                String role = authority.getAuthority();
                if (role != null && role.startsWith("ROLE_")) {
                    return role.substring("ROLE_".length());
                }
            }
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("Authenticated user not found"));
        return user.getRoleType().name();
    }

    private List<Long> resolveAllowedStoreIds(String role, Long userId) {
        if (!"CORPORATE".equalsIgnoreCase(role)) {
            return List.of();
        }

        List<Store> stores = storeRepository.findByOwnerId(userId);
        if (stores == null || stores.isEmpty()) {
            return List.of();
        }

        List<Long> ids = new ArrayList<>();
        for (Store store : stores) {
            if (store.getId() != null) {
                ids.add(store.getId());
            }
        }
        return ids;
    }

    private Long resolveActiveStoreId(ChatRequest request, List<Long> allowedStoreIds) {
        if (request.getStoreId() != null) {
            if (allowedStoreIds.isEmpty() || allowedStoreIds.contains(request.getStoreId())) {
                return request.getStoreId();
            }
        }

        if (!allowedStoreIds.isEmpty()) {
            return allowedStoreIds.get(0);
        }
        return null;
    }
}
