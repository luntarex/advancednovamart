package com.novamart.service;

import com.novamart.dto.response.AnalyticsResponse;
import com.novamart.entity.CustomerProfile;
import com.novamart.entity.Order;
import com.novamart.entity.OrderItem;
import com.novamart.entity.Store;
import com.novamart.enums.OrderStatus;
import com.novamart.repository.CustomerProfileRepository;
import com.novamart.repository.OrderItemRepository;
import com.novamart.repository.OrderRepository;
import com.novamart.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.format.TextStyle;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final StoreRepository storeRepository;
    private final CustomerProfileRepository customerProfileRepository;

    @Transactional(readOnly = true)
    public List<AnalyticsResponse> getSalesByCategory(
            Long requesterUserId,
            boolean isAdmin,
            String range,
            String startDate,
            String endDate
    ) {
        List<Order> orders = getScopedOrders(requesterUserId, isAdmin);
        List<Order> filteredOrders = applyDateFilter(orders, range, startDate, endDate);
        List<OrderItem> orderItems = getOrderItemsForOrders(filteredOrders);

        Map<String, Double> byCategory = new LinkedHashMap<>();
        for (OrderItem item : orderItems) {
            String categoryName = item.getProduct() != null && item.getProduct().getCategory() != null
                    ? item.getProduct().getCategory().getName()
                    : "Uncategorized";
            byCategory.merge(categoryName, item.getPrice().doubleValue(), Double::sum);
        }

        return byCategory.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .map(entry -> AnalyticsResponse.builder().label(entry.getKey()).value(entry.getValue()).build())
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AnalyticsResponse> getRevenueTrend(
            Long requesterUserId,
            boolean isAdmin,
            String range,
            String startDate,
            String endDate
    ) {
        List<Order> orders = applyDateFilter(getScopedOrders(requesterUserId, isAdmin), range, startDate, endDate);

        Map<Integer, Double> revenueByMonth = new LinkedHashMap<>();
        for (Order order : orders) {
            if (order.getOrderDate() == null || order.getGrandTotal() == null) {
                continue;
            }
            int month = order.getOrderDate().getMonthValue();
            revenueByMonth.merge(month, order.getGrandTotal().doubleValue(), Double::sum);
        }

        return revenueByMonth.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> AnalyticsResponse.builder()
                        .label(LocalDate.of(2000, entry.getKey(), 1).getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH))
                        .value(entry.getValue())
                        .build())
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AnalyticsResponse> getTopProducts(Long requesterUserId, boolean isAdmin, int limit) {
        List<OrderItem> orderItems = getOrderItemsForOrders(getScopedOrders(requesterUserId, isAdmin));
        Map<String, Double> revenueByProduct = new LinkedHashMap<>();

        for (OrderItem item : orderItems) {
            String productName = item.getProduct() != null ? item.getProduct().getName() : "Unknown Product";
            revenueByProduct.merge(productName, item.getPrice().doubleValue(), Double::sum);
        }

        int safeLimit = Math.max(1, limit);
        return revenueByProduct.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(safeLimit)
                .map(entry -> AnalyticsResponse.builder().label(entry.getKey()).value(entry.getValue()).build())
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AnalyticsResponse> getCustomerSegments(Long requesterUserId, boolean isAdmin) {
        List<CustomerProfile> profiles;
        if (isAdmin) {
            profiles = customerProfileRepository.findAll();
        } else {
            List<Long> userIds = getScopedOrders(requesterUserId, false).stream()
                    .map(order -> order.getUser().getId())
                    .distinct()
                    .toList();
            profiles = userIds.isEmpty() ? List.of() : customerProfileRepository.findByUserIdIn(userIds);
        }

        Map<String, Double> segments = new LinkedHashMap<>();
        segments.put("High Value", 0.0);
        segments.put("Regular", 0.0);
        segments.put("New", 0.0);

        for (CustomerProfile profile : profiles) {
            double spend = profile.getTotalSpend() != null ? profile.getTotalSpend() : 0.0;
            if (spend >= 10000) {
                segments.put("High Value", segments.get("High Value") + 1);
            } else if (spend >= 2000) {
                segments.put("Regular", segments.get("Regular") + 1);
            } else {
                segments.put("New", segments.get("New") + 1);
            }
        }

        return segments.entrySet().stream()
                .map(entry -> AnalyticsResponse.builder().label(entry.getKey()).value(entry.getValue()).build())
                .toList();
    }

    private List<Order> getScopedOrders(Long requesterUserId, boolean isAdmin) {
        List<Order> scoped;
        if (isAdmin) {
            scoped = orderRepository.findAll();
        } else {
            List<Long> ownedStoreIds = storeRepository.findByOwnerId(requesterUserId).stream()
                    .map(Store::getId)
                    .toList();
            if (ownedStoreIds.isEmpty()) {
                scoped = orderRepository.findByUserId(requesterUserId);
            } else {
                scoped = orderRepository.findByStoreIdIn(ownedStoreIds);
            }
        }

        return scoped.stream()
                .filter(order -> order.getStatus() != OrderStatus.CART)
                .toList();
    }

    private List<OrderItem> getOrderItemsForOrders(List<Order> orders) {
        List<Long> orderIds = orders.stream().map(Order::getId).toList();
        if (orderIds.isEmpty()) {
            return List.of();
        }
        return orderItemRepository.findByOrderIdIn(orderIds);
    }

    private List<Order> applyDateFilter(List<Order> orders, String range, String startDate, String endDate) {
        LocalDateTime start = resolveStart(range, startDate);
        LocalDateTime end = resolveEnd(endDate);

        List<Order> filtered = orders.stream()
                .filter(order -> order.getOrderDate() != null)
                .filter(order -> start == null || !order.getOrderDate().isBefore(start))
                .filter(order -> end == null || !order.getOrderDate().isAfter(end))
                .sorted(Comparator.comparing(Order::getOrderDate))
                .collect(Collectors.toList());

        // If a quick preset range (7d/30d/90d) returns no data, fall back to full history.
        // This keeps dashboards populated for datasets whose timestamps are mostly historical.
        boolean usedPresetRange = range != null && !range.isBlank() && (startDate == null || startDate.isBlank()) && (endDate == null || endDate.isBlank());
        if (usedPresetRange && filtered.isEmpty()) {
            return orders.stream()
                    .filter(order -> order.getOrderDate() != null)
                    .sorted(Comparator.comparing(Order::getOrderDate))
                    .collect(Collectors.toList());
        }

        return filtered;
    }

    private LocalDateTime resolveStart(String range, String startDate) {
        if (startDate != null && !startDate.isBlank()) {
            try {
                return LocalDate.parse(startDate).atStartOfDay();
            } catch (DateTimeParseException ignored) {
            }
        }

        if (range == null || range.isBlank()) {
            return null;
        }

        LocalDateTime now = LocalDateTime.now();
        return switch (range) {
            case "7d" -> now.minusDays(7);
            case "30d" -> now.minusDays(30);
            case "90d" -> now.minusDays(90);
            default -> null;
        };
    }

    private LocalDateTime resolveEnd(String endDate) {
        if (endDate == null || endDate.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(endDate).atTime(23, 59, 59);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }
}
