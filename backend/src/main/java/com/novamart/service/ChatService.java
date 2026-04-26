package com.novamart.service;

import com.novamart.dto.request.ChatRequest;
import com.novamart.dto.response.ChatResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ChatService {

    private static final String PYTHON_CHATBOT_URL = "http://localhost:8000/ask";

    /**
     * Forwards the chat question to the Python LangGraph service
     * and returns the response to the Angular frontend.
     */
    public ChatResponse ask(ChatRequest request) {
        try {
            RestTemplate restTemplate = new RestTemplate();

            // Build the request body for the Python service
            Map<String, String> body = new HashMap<>();
            body.put("question", request.getQuestion());
            if (request.getSessionId() != null) {
                body.put("session_id", request.getSessionId());
            }

            // Call the Python FastAPI service
            @SuppressWarnings("unchecked")
            Map<String, String> result = restTemplate.postForObject(
                    PYTHON_CHATBOT_URL, body, Map.class
            );

            if (result != null) {
                return ChatResponse.builder()
                        .answer(result.getOrDefault("answer", "No response from AI service."))
                        .visualizationCode(result.getOrDefault("visualization_code", ""))
                        .build();
            }

        } catch (Exception e) {
            // If Python service is down, return a friendly error
            return ChatResponse.builder()
                    .answer("AI chatbot service is currently unavailable. Error: " + e.getMessage())
                    .build();
        }

        return ChatResponse.builder()
                .answer("Unable to process your question.")
                .build();
    }
}
