package com.novamart.service;

import com.novamart.entity.Order;
import com.novamart.entity.OrderItem;
import com.novamart.exception.ResourceNotFoundException;
import com.novamart.repository.OrderRepository;
import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.checkout.SessionCreateParams;
import com.novamart.enums.OrderStatus;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class StripeService {

    @Value("${stripe.api.key}")
    private String stripeApiKey;

    @Value("${frontend.url}")
    private String frontendUrl;

    @Value("${stripe.webhook.secret}")
    private String webhookSecret;

    private final OrderRepository orderRepository;

    @PostConstruct
    public void init() {
        Stripe.apiKey = stripeApiKey;
    }

    @Transactional
    public String createCheckoutSession(Long orderId) throws StripeException {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order", orderId));

        List<SessionCreateParams.LineItem> sessionItems = new ArrayList<>();

        for (OrderItem item : order.getItems()) {
            SessionCreateParams.LineItem.PriceData priceData = SessionCreateParams.LineItem.PriceData.builder()
                    .setCurrency("usd")
                    .setUnitAmount(item.getPrice().multiply(BigDecimal.valueOf(100)).longValue())
                    .setProductData(
                            SessionCreateParams.LineItem.PriceData.ProductData.builder()
                                    .setName(item.getProduct().getName())
                                    .build()
                    )
                    .build();

            SessionCreateParams.LineItem sessionItem = SessionCreateParams.LineItem.builder()
                    .setPriceData(priceData)
                    .setQuantity((long) item.getQuantity())
                    .build();

            sessionItems.add(sessionItem);
        }

        SessionCreateParams params = SessionCreateParams.builder()
                .addPaymentMethodType(SessionCreateParams.PaymentMethodType.CARD)
                .setMode(SessionCreateParams.Mode.PAYMENT)
                .setSuccessUrl(frontendUrl + "/checkout/success?session_id={CHECKOUT_SESSION_ID}")
                .setCancelUrl(frontendUrl + "/checkout/cancel")
                .addAllLineItem(sessionItems)
                .putMetadata("orderId", String.valueOf(orderId))
                .build();

        Session session = Session.create(params);
        
        order.setStripeSessionId(session.getId());
        orderRepository.save(order);

        return session.getUrl();
    }

    @Transactional
    public void handleWebhook(String payload, String sigHeader) {
        Event event = null;
        try {
            event = Webhook.constructEvent(payload, sigHeader, webhookSecret);
        } catch (Exception e) {
            throw new RuntimeException("Invalid webhook signature");
        }

        if ("checkout.session.completed".equals(event.getType())) {
            EventDataObjectDeserializer dataObjectDeserializer = event.getDataObjectDeserializer();
            if (dataObjectDeserializer.getObject().isPresent()) {
                StripeObject stripeObject = dataObjectDeserializer.getObject().get();
                if (stripeObject instanceof Session session) {
                    handleCheckoutSessionCompleted(session);
                }
            }
        }
    }

    private void handleCheckoutSessionCompleted(Session session) {
        String orderIdStr = session.getMetadata().get("orderId");
        if (orderIdStr != null) {
            Long orderId = Long.parseLong(orderIdStr);
            Order order = orderRepository.findById(orderId)
                    .orElseThrow(() -> new ResourceNotFoundException("Order", orderId));
            
            order.setStatus(OrderStatus.PROCESSING);
            orderRepository.save(order);
            
            // Clear the cart for the user
            orderRepository.findByUserIdAndStatus(order.getUser().getId(), OrderStatus.CART)
                .ifPresent(cart -> {
                    cart.getItems().clear();
                    cart.setGrandTotal(BigDecimal.ZERO);
                    orderRepository.save(cart);
                });
        }
    }
}
