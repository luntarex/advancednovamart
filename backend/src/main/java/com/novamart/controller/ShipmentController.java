package com.novamart.controller;

import com.novamart.dto.response.ShipmentResponse;
import com.novamart.service.ShipmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/shipments")
@RequiredArgsConstructor
public class ShipmentController {

    private final ShipmentService shipmentService;

    @GetMapping
    public ResponseEntity<List<ShipmentResponse>> getAll() {
        return ResponseEntity.ok(shipmentService.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ShipmentResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(shipmentService.getById(id));
    }

    @PostMapping
    public ResponseEntity<ShipmentResponse> create(@RequestBody Map<String, Object> data) {
        return ResponseEntity.ok(shipmentService.create(data));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ShipmentResponse> update(@PathVariable Long id, @RequestBody Map<String, Object> data) {
        return ResponseEntity.ok(shipmentService.update(id, data));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        shipmentService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
