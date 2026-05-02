package com.novamart.service;

import com.novamart.dto.request.CreateOrderRequest;
import com.novamart.dto.request.CartItemRequest;
import com.novamart.dto.response.OrderResponse;
import com.novamart.dto.response.OrderItemResponse;
import com.novamart.entity.*;
import com.novamart.enums.OrderStatus;
import com.novamart.exception.ResourceNotFoundException;
import com.novamart.repository.OrderRepository;
import com.novamart.repository.ProductRepository;
import com.novamart.repository.StoreRepository;
import com.novamart.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final StoreRepository storeRepository;

    public List<OrderResponse> getAll(Long requesterUserId, boolean isAdmin) {
        List<Order> orders;
        if (isAdmin) {
            orders = orderRepository.findAll();
        } else {
            List<Long> ownedStoreIds = storeRepository.findByOwnerId(requesterUserId).stream()
                    .map(Store::getId)
                    .toList();
            if (!ownedStoreIds.isEmpty()) {
                orders = orderRepository.findByStoreIdIn(ownedStoreIds);
            } else {
                orders = orderRepository.findByUserId(requesterUserId);
            }
        }
        return orders.stream()
                .filter(order -> order.getStatus() != OrderStatus.CART)
                .map(this::toResponse)
                .toList();
    }

    public List<OrderResponse> getByUserId(Long userId) {
        return orderRepository.findByUserId(userId).stream()
                .filter(order -> order.getStatus() != OrderStatus.CART)
                .map(this::toResponse)
                .toList();
    }

    public OrderResponse getById(Long id) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Order", id));
        return toResponse(order);
    }

    @Transactional
    public OrderResponse create(CreateOrderRequest request, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        Order order = Order.builder()
                .user(user)
                .status(OrderStatus.PENDING)
                .paymentMethod(request.getPaymentMethod())
                .grandTotal(BigDecimal.ZERO)
                .build();

        if (request.getStoreId() != null) {
            order.setStore(storeRepository.findById(request.getStoreId()).orElse(null));
        }

        BigDecimal total = BigDecimal.ZERO;

        if (request.getItems() != null) {
            for (CreateOrderRequest.OrderItemRequest itemReq : request.getItems()) {
                Product product = productRepository.findById(itemReq.getProductId())
                        .orElseThrow(() -> new ResourceNotFoundException("Product", itemReq.getProductId()));

                BigDecimal lineTotal = product.getUnitPrice().multiply(BigDecimal.valueOf(itemReq.getQuantity()));

                OrderItem item = OrderItem.builder()
                        .order(order)
                        .product(product)
                        .quantity(itemReq.getQuantity())
                        .price(lineTotal)
                        .build();

                order.getItems().add(item);
                total = total.add(lineTotal);

                // Reduce stock
                product.setStockQuantity(product.getStockQuantity() - itemReq.getQuantity());
                productRepository.save(product);
            }
        }

        order.setGrandTotal(total);
        order = orderRepository.save(order);
        return toResponse(order);
    }

    public OrderResponse update(Long id, Map<String, Object> data) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Order", id));

        if (data.containsKey("status")) {
            try {
                order.setStatus(OrderStatus.valueOf(((String) data.get("status")).toUpperCase()));
            } catch (IllegalArgumentException ignored) {}
        }
        if (data.containsKey("paymentMethod")) {
            order.setPaymentMethod((String) data.get("paymentMethod"));
        }

        order = orderRepository.save(order);
        return toResponse(order);
    }

    @Transactional(readOnly = true)
    public OrderResponse getCart(Long userId) {
        return orderRepository.findByUserIdAndStatus(userId, OrderStatus.CART)
                .map(this::toResponse)
                .orElseGet(() -> emptyCartResponse(userId));
    }

    @Transactional
    public OrderResponse addCartItem(Long userId, CartItemRequest request) {
        Product product = productRepository.findById(request.getProductId())
                .orElseThrow(() -> new ResourceNotFoundException("Product", request.getProductId()));
        if (product.getStockQuantity() <= 0) {
            throw new IllegalStateException("Product is out of stock");
        }

        Order cart = getOrCreateCart(userId);
        OrderItem existing = cart.getItems().stream()
                .filter(item -> item.getProduct() != null && item.getProduct().getId().equals(product.getId()))
                .findFirst()
                .orElse(null);

        int nextQuantity = request.getQuantity();
        if (existing != null) {
            nextQuantity = existing.getQuantity() + request.getQuantity();
        }
        nextQuantity = Math.min(nextQuantity, product.getStockQuantity());

        if (existing == null) {
            OrderItem item = OrderItem.builder()
                    .order(cart)
                    .product(product)
                    .quantity(nextQuantity)
                    .price(product.getUnitPrice())
                    .build();
            cart.getItems().add(item);
        } else {
            existing.setQuantity(nextQuantity);
            existing.setPrice(product.getUnitPrice());
        }

        refreshGrandTotal(cart);
        Order saved = orderRepository.save(cart);
        return toResponse(saved);
    }

    @Transactional
    public OrderResponse updateCartItem(Long userId, Long productId, Integer quantity) {
        Order cart = orderRepository.findByUserIdAndStatus(userId, OrderStatus.CART)
                .orElseThrow(() -> new ResourceNotFoundException("Cart not found for user id: " + userId));
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product", productId));

        OrderItem existing = cart.getItems().stream()
                .filter(item -> item.getProduct() != null && item.getProduct().getId().equals(productId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Cart item not found for product id: " + productId));

        int safeQuantity = Math.max(1, Math.min(quantity, product.getStockQuantity()));
        existing.setQuantity(safeQuantity);
        existing.setPrice(product.getUnitPrice());

        refreshGrandTotal(cart);
        return toResponse(orderRepository.save(cart));
    }

    @Transactional
    public OrderResponse removeCartItem(Long userId, Long productId) {
        Order cart = orderRepository.findByUserIdAndStatus(userId, OrderStatus.CART)
                .orElseThrow(() -> new ResourceNotFoundException("Cart not found for user id: " + userId));

        cart.getItems().removeIf(item -> item.getProduct() != null && item.getProduct().getId().equals(productId));
        refreshGrandTotal(cart);
        return toResponse(orderRepository.save(cart));
    }

    @Transactional
    public void clearCart(Long userId) {
        orderRepository.findByUserIdAndStatus(userId, OrderStatus.CART).ifPresent(cart -> {
            cart.getItems().clear();
            cart.setGrandTotal(BigDecimal.ZERO);
            orderRepository.save(cart);
        });
    }

    @Transactional
    public OrderResponse checkoutCart(Long userId) {
        Order cart = orderRepository.findByUserIdAndStatus(userId, OrderStatus.CART)
                .orElseThrow(() -> new ResourceNotFoundException("Cart not found for user id: " + userId));
        
        if (cart.getItems().isEmpty()) {
            throw new IllegalStateException("Cart is empty");
        }

        // Create a new PENDING order from cart items
        Order order = Order.builder()
                .user(cart.getUser())
                .status(OrderStatus.PENDING)
                .paymentMethod("CREDIT_CARD")
                .grandTotal(cart.getGrandTotal())
                .build();
        
        // Clone items and reduce stock
        for (OrderItem cartItem : cart.getItems()) {
            Product product = cartItem.getProduct();
            if (product.getStockQuantity() < cartItem.getQuantity()) {
                throw new IllegalStateException("Not enough stock for product: " + product.getName());
            }
            product.setStockQuantity(product.getStockQuantity() - cartItem.getQuantity());
            productRepository.save(product);

            OrderItem orderItem = OrderItem.builder()
                    .order(order)
                    .product(product)
                    .quantity(cartItem.getQuantity())
                    .price(cartItem.getPrice())
                    .build();
            order.getItems().add(orderItem);
        }

        order = orderRepository.save(order);

        // Clear the cart
        cart.getItems().clear();
        cart.setGrandTotal(BigDecimal.ZERO);
        orderRepository.save(cart);

        return toResponse(order);
    }

    @Transactional(readOnly = true)
    public int getCartCount(Long userId) {
        return orderRepository.findByUserIdAndStatus(userId, OrderStatus.CART)
                .map(order -> order.getItems().stream().mapToInt(OrderItem::getQuantity).sum())
                .orElse(0);
    }

    public void delete(Long id) {
        if (!orderRepository.existsById(id)) {
            throw new ResourceNotFoundException("Order", id);
        }
        orderRepository.deleteById(id);
    }

    private OrderResponse toResponse(Order order) {
        var items = order.getItems() != null
                ? order.getItems().stream().map(item -> OrderItemResponse.builder()
                        .id(item.getId())
                        .productId(item.getProduct() != null ? item.getProduct().getId() : null)
                        .productName(item.getProduct() != null ? item.getProduct().getName() : null)
                        .quantity(item.getQuantity())
                        .price(item.getPrice())
                        .build()).toList()
                : List.<OrderItemResponse>of();

        return OrderResponse.builder()
                .id(order.getId())
                .userId(order.getUser().getId())
                .storeId(order.getStore() != null ? order.getStore().getId() : null)
                .status(order.getStatus().name())
                .grandTotal(order.getGrandTotal())
                .paymentMethod(order.getPaymentMethod())
                .orderDate(order.getOrderDate() != null ? order.getOrderDate().toString() : null)
                .items(items)
                .build();
    }

    private Order getOrCreateCart(Long userId) {
        return orderRepository.findByUserIdAndStatus(userId, OrderStatus.CART)
                .orElseGet(() -> {
                    User user = userRepository.findById(userId)
                            .orElseThrow(() -> new ResourceNotFoundException("User", userId));
                    Order cart = Order.builder()
                            .user(user)
                            .status(OrderStatus.CART)
                            .paymentMethod(null)
                            .grandTotal(BigDecimal.ZERO)
                            .build();
                    return orderRepository.save(cart);
                });
    }

    private void refreshGrandTotal(Order order) {
        BigDecimal total = order.getItems().stream()
                .map(item -> item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        order.setGrandTotal(total);
    }

    private OrderResponse emptyCartResponse(Long userId) {
        return OrderResponse.builder()
                .id(null)
                .userId(userId)
                .storeId(null)
                .status(OrderStatus.CART.name())
                .grandTotal(BigDecimal.ZERO)
                .paymentMethod(null)
                .orderDate(null)
                .items(List.of())
                .build();
    }
}
