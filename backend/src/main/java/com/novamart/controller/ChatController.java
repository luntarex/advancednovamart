package com.novamart.controller;

import com.novamart.dto.request.ChatRequest;
import com.novamart.dto.response.ChatResponse;
import com.novamart.service.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @PostMapping("/ask")
    public ResponseEntity<ChatResponse> ask(@Valid @RequestBody ChatRequest request,
                                            Authentication authentication) {
        return ResponseEntity.ok(chatService.ask(request, authentication));
    }
}
