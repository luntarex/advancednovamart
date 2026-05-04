package com.novamart.service;

import com.novamart.dto.request.UpdateShipmentRequest;
import com.novamart.dto.response.ShipmentResponse;
import com.novamart.entity.Order;
import com.novamart.entity.Shipment;
import com.novamart.enums.ShipmentStatus;
import com.novamart.exception.ResourceNotFoundException;
import com.novamart.repository.OrderRepository;
import com.novamart.repository.ShipmentRepository;
import com.novamart.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
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
    private final StoreRepository storeRepository;

    public List<ShipmentResponse> getAll(Long requesterUserId, boolean isAdmin) {
        return shipmentRepository.findAll().stream()
                .filter(shipment -> isAdmin || canAccessShipment(shipment, requesterUserId))
                .map(this::toResponse)
                .toList();
    }

    public ShipmentResponse getById(Long id, Long requesterUserId, boolean isAdmin) {
        Shipment shipment = shipmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Shipment", id));
        if (!isAdmin && !canAccessShipment(shipment, requesterUserId)) {
            throw new AccessDeniedException("You do not have access to this shipment");
        }
        return toResponse(shipment);
    }

    public ShipmentResponse create(Map<String, Object> data, Long requesterUserId, boolean isAdmin) {
        Long orderId = Long.valueOf(data.get("orderId").toString());
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order", orderId));
        if (!isAdmin && !ownsOrderStore(order, requesterUserId)) {
            throw new AccessDeniedException("You do not have access to this order");
        }

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

    public ShipmentResponse update(Long id, Map<String, Object> data, Long requesterUserId, boolean isAdmin) {
        Shipment shipment = shipmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Shipment", id));
        if (!isAdmin && !ownsOrderStore(shipment.getOrder(), requesterUserId)) {
            throw new AccessDeniedException("You do not have access to this shipment");
        }

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

    private boolean canAccessShipment(Shipment shipment, Long requesterUserId) {
        if (requesterUserId == null || shipment.getOrder() == null) {
            return false;
        }
        Order order = shipment.getOrder();
        if (order.getUser() != null && requesterUserId.equals(order.getUser().getId())) {
            return true;
        }
        return ownsOrderStore(order, requesterUserId);
    }

    private boolean ownsOrderStore(Order order, Long requesterUserId) {
        if (requesterUserId == null || order == null || order.getStore() == null || order.getStore().getId() == null) {
            return false;
        }
        Long storeId = order.getStore().getId();
        return storeRepository.findByOwnerId(requesterUserId).stream()
                .anyMatch(store -> storeId.equals(store.getId()));
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
