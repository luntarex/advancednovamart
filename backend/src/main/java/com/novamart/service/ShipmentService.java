package com.novamart.service;

import com.novamart.dto.request.UpdateShipmentRequest;
import com.novamart.dto.response.ShipmentResponse;
import com.novamart.entity.Order;
import com.novamart.entity.Shipment;
import com.novamart.enums.ShipmentStatus;
import com.novamart.exception.ResourceNotFoundException;
import com.novamart.repository.OrderRepository;
import com.novamart.repository.ShipmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ShipmentService {

    private final ShipmentRepository shipmentRepository;
    private final OrderRepository orderRepository;

    public List<ShipmentResponse> getAll() {
        return shipmentRepository.findAll().stream().map(this::toResponse).toList();
    }

    public ShipmentResponse getById(Long id) {
        Shipment shipment = shipmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Shipment", id));
        return toResponse(shipment);
    }

    public ShipmentResponse create(Map<String, Object> data) {
        Long orderId = Long.valueOf(data.get("orderId").toString());
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order", orderId));

        Shipment shipment = Shipment.builder()
                .order(order)
                .status(ShipmentStatus.PENDING)
                .trackingNumber("NVM-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase())
                .warehouse(data.getOrDefault("warehouse", "A").toString())
                .mode(data.getOrDefault("mode", "Standard").toString())
                .estimatedDelivery(LocalDate.now().plusDays(7))
                .build();

        shipment = shipmentRepository.save(shipment);
        return toResponse(shipment);
    }

    public ShipmentResponse update(Long id, Map<String, Object> data) {
        Shipment shipment = shipmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Shipment", id));

        if (data.containsKey("status")) {
            try {
                shipment.setStatus(ShipmentStatus.valueOf(((String) data.get("status")).toUpperCase()));
            } catch (IllegalArgumentException ignored) {}
        }
        if (data.containsKey("warehouse")) {
            shipment.setWarehouse((String) data.get("warehouse"));
        }
        if (data.containsKey("mode")) {
            shipment.setMode((String) data.get("mode"));
        }
        if (data.containsKey("trackingNumber")) {
            shipment.setTrackingNumber((String) data.get("trackingNumber"));
        }

        shipment = shipmentRepository.save(shipment);
        return toResponse(shipment);
    }

    public void delete(Long id) {
        if (!shipmentRepository.existsById(id)) {
            throw new ResourceNotFoundException("Shipment", id);
        }
        shipmentRepository.deleteById(id);
    }

    private ShipmentResponse toResponse(Shipment shipment) {
        return ShipmentResponse.builder()
                .id(shipment.getId())
                .orderId(shipment.getOrder().getId())
                .warehouse(shipment.getWarehouse())
                .mode(shipment.getMode())
                .trackingNumber(shipment.getTrackingNumber())
                .status(shipment.getStatus().name())
                .estimatedDelivery(shipment.getEstimatedDelivery() != null ? shipment.getEstimatedDelivery().toString() : null)
                .lastUpdated(shipment.getLastUpdated() != null ? shipment.getLastUpdated().toString() : null)
                .build();
    }
}
