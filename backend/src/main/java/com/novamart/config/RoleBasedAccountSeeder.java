package com.novamart.config;

import com.novamart.entity.Address;
import com.novamart.entity.Category;
import com.novamart.entity.CustomerProfile;
import com.novamart.entity.Order;
import com.novamart.entity.OrderItem;
import com.novamart.entity.Product;
import com.novamart.entity.Shipment;
import com.novamart.entity.Store;
import com.novamart.entity.User;
import com.novamart.enums.OrderStatus;
import com.novamart.enums.RoleType;
import com.novamart.enums.ShipmentStatus;
import com.novamart.enums.StoreStatus;
import com.novamart.repository.AddressRepository;
import com.novamart.repository.CategoryRepository;
import com.novamart.repository.CustomerProfileRepository;
import com.novamart.repository.OrderItemRepository;
import com.novamart.repository.OrderRepository;
import com.novamart.repository.ProductRepository;
import com.novamart.repository.ShipmentRepository;
import com.novamart.repository.StoreRepository;
import com.novamart.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class RoleBasedAccountSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final CustomerProfileRepository customerProfileRepository;
    private final StoreRepository storeRepository;
    private final AddressRepository addressRepository;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final ShipmentRepository shipmentRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(String... args) {
        seedAdmins();
        List<User> individualUsers = seedIndividuals();
        seedCorporates(individualUsers);
        log.info("RoleBasedAccountSeeder finished. Admin:3 Corporate:3 Individual:3 (create-if-missing)");
    }

    private void seedAdmins() {
        ensureUser("admin.alpha@novamart.com", "AdminAlpha123!", RoleType.ADMIN, "Male");
        ensureUser("admin.bravo@novamart.com", "AdminBravo123!", RoleType.ADMIN, "Female");
        ensureUser("admin.charlie@novamart.com", "AdminCharlie123!", RoleType.ADMIN, "Other");
    }

    private void seedCorporates(List<User> buyers) {
        User corp1 = ensureUser("corporate.ankara@novamart.com", "CorporateAnk123!", RoleType.CORPORATE, "Male");
        User corp2 = ensureUser("corporate.istanbul@novamart.com", "CorporateIst123!", RoleType.CORPORATE, "Female");
        User corp3 = ensureUser("corporate.izmir@novamart.com", "CorporateIzm123!", RoleType.CORPORATE, "Other");

        Store store1 = ensureStore(corp1, "Anatolia Tech Wholesale");
        Store store2 = ensureStore(corp2, "Bosphorus Retail Group");
        Store store3 = ensureStore(corp3, "Ege Marketplace Solutions");

        seedCorporateStoreData(store1, buyers);
        seedCorporateStoreData(store2, buyers);
        seedCorporateStoreData(store3, buyers);
    }

    private List<User> seedIndividuals() {
        User ind1 = ensureUser("mert.yilmaz@novamart.com", "MertUser123!", RoleType.INDIVIDUAL, "Male");
        User ind2 = ensureUser("elif.demir@novamart.com", "ElifUser123!", RoleType.INDIVIDUAL, "Female");
        User ind3 = ensureUser("deniz.kaya@novamart.com", "DenizUser123!", RoleType.INDIVIDUAL, "Other");

        ensureCustomerProfile(ind1, 29, "Istanbul", "Gold", 12850.0, 42, 4.6, true, "Satisfied");
        ensureCustomerProfile(ind2, 34, "Ankara", "Silver", 7350.0, 23, 4.4, true, "Satisfied");
        ensureCustomerProfile(ind3, 26, "Izmir", "Standard", 3120.0, 11, 4.1, false, "Neutral");

        ensureDefaultAddress(ind1, "Kadikoy Moda Caddesi No:12 D:5", "Istanbul", "Kadikoy", "+90 532 111 2233");
        ensureDefaultAddress(ind2, "Cankaya Ataturk Bulvari No:88", "Ankara", "Cankaya", "+90 533 222 3344");
        ensureDefaultAddress(ind3, "Konak Cumhuriyet Meydani No:20", "Izmir", "Konak", "+90 534 333 4455");

        return List.of(ind1, ind2, ind3);
    }

    private User ensureUser(String email, String rawPassword, RoleType roleType, String gender) {
        return userRepository.findByEmail(email).orElseGet(() -> {
            User user = User.builder()
                    .email(email)
                    .password(passwordEncoder.encode(rawPassword))
                    .roleType(roleType)
                    .gender(gender)
                    .build();
            return userRepository.save(user);
        });
    }

    private Store ensureStore(User owner, String storeName) {
        List<Store> stores = storeRepository.findByOwnerId(owner.getId());
        if (!stores.isEmpty()) {
            return stores.get(0);
        }

        Store store = Store.builder()
                .name(storeName)
                .owner(owner)
                .status(StoreStatus.OPEN)
                .build();
        return storeRepository.save(store);
    }

    private void ensureCustomerProfile(
            User user,
            int age,
            String city,
            String membershipType,
            double totalSpend,
            int itemsPurchased,
            double avgRating,
            boolean discountApplied,
            String satisfactionLevel
    ) {
        if (customerProfileRepository.findByUserId(user.getId()).isPresent()) {
            return;
        }

        CustomerProfile profile = CustomerProfile.builder()
                .user(user)
                .age(age)
                .city(city)
                .membershipType(membershipType)
                .totalSpend(totalSpend)
                .itemsPurchased(itemsPurchased)
                .avgRating(avgRating)
                .discountApplied(discountApplied)
                .satisfactionLevel(satisfactionLevel)
                .build();
        customerProfileRepository.save(profile);
    }

    private void ensureDefaultAddress(User user, String addressLine, String city, String district, String phone) {
        List<Address> addresses = addressRepository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(user.getId());
        if (!addresses.isEmpty()) {
            boolean hasDefault = addresses.stream().anyMatch(Address::isDefault);
            if (!hasDefault) {
                Address firstAddress = addresses.get(0);
                firstAddress.setDefault(true);
                addressRepository.save(firstAddress);
            }
            return;
        }

        Address address = Address.builder()
                .user(user)
                .addressLine(addressLine)
                .city(city)
                .district(district)
                .phone(phone)
                .isDefault(true)
                .build();
        addressRepository.save(address);
    }

    private void seedCorporateStoreData(Store store, List<User> buyers) {
        if (store == null || store.getId() == null) {
            return;
        }

        Category electronics = ensureCategory("Electronics");
        Category home = ensureCategory("Home");
        Category fashion = ensureCategory("Fashion");

        List<Product> products = new ArrayList<>();
        products.add(ensureProduct(store, electronics, "NovaPro Laptop 14", "NOVA-LAP", new BigDecimal("38999"), 16));
        products.add(ensureProduct(store, electronics, "NovaBuds ANC", "NOVA-BUD", new BigDecimal("3499"), 42));
        products.add(ensureProduct(store, home, "Smart Air Purifier", "NOVA-AIR", new BigDecimal("5799"), 9));
        products.add(ensureProduct(store, fashion, "Performance Hoodie", "NOVA-HOOD", new BigDecimal("1299"), 27));

        ensureMonthlyOrderCoverage(store, buyers, products);
    }

    private Category ensureCategory(String name) {
        return categoryRepository.findAll().stream()
                .filter(category -> category.getName() != null && category.getName().equalsIgnoreCase(name))
                .findFirst()
                .orElseGet(() -> categoryRepository.save(Category.builder().name(name).build()));
    }

    private Product ensureProduct(Store store, Category category, String name, String skuBase, BigDecimal price, int stockQuantity) {
        String sku = skuBase + "-S" + store.getId();
        return productRepository.findAll().stream()
                .filter(product -> sku.equalsIgnoreCase(product.getSku()))
                .findFirst()
                .orElseGet(() -> productRepository.save(Product.builder()
                        .name(name)
                        .sku(sku)
                        .description(name + " for " + store.getName())
                        .unitPrice(price)
                        .stockQuantity(stockQuantity)
                        .category(category)
                        .store(store)
                        .build()));
    }

    private void ensureMonthlyOrderCoverage(Store store, List<User> buyers, List<Product> products) {
        List<Order> existingOrders = orderRepository.findByStoreId(store.getId());
        Set<YearMonth> existingMonths = new HashSet<>();
        for (Order order : existingOrders) {
            if (order.getOrderDate() != null) {
                existingMonths.add(YearMonth.from(order.getOrderDate()));
            }
        }

        final int monthsToCover = 8;
        final String[] paymentMethods = {"CREDIT_CARD", "DEBIT_CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY"};

        int created = 0;
        for (int offset = monthsToCover - 1; offset >= 0; offset--) {
            YearMonth month = YearMonth.now().minusMonths(offset);
            if (existingMonths.contains(month)) {
                continue;
            }

            int idx = created % products.size();
            Product product = products.get(idx);
            User buyer = buyers.get(created % buyers.size());
            int quantity = 1 + (created % 3);
            String paymentMethod = paymentMethods[created % paymentMethods.length];

            OrderStatus orderStatus;
            ShipmentStatus shipmentStatus;
            if (offset == 0) {
                orderStatus = (created % 2 == 0) ? OrderStatus.PENDING : OrderStatus.PROCESSING;
                shipmentStatus = ShipmentStatus.PENDING;
            } else if (offset == 1) {
                orderStatus = OrderStatus.SHIPPED;
                shipmentStatus = ShipmentStatus.IN_TRANSIT;
            } else {
                orderStatus = OrderStatus.DELIVERED;
                shipmentStatus = ShipmentStatus.DELIVERED;
            }

            int safeDay = Math.min(10 + (created % 12), month.lengthOfMonth());
            LocalDateTime orderDate = month.atDay(safeDay).atTime(11 + (created % 6), 20);

            createOrderWithShipment(
                    store,
                    buyer,
                    product,
                    quantity,
                    orderStatus,
                    shipmentStatus,
                    orderDate,
                    paymentMethod
            );
            created++;
        }
    }

    private void createOrderWithShipment(
            Store store,
            User buyer,
            Product product,
            int quantity,
            OrderStatus orderStatus,
            ShipmentStatus shipmentStatus,
            LocalDateTime orderDate,
            String paymentMethod
    ) {
        BigDecimal total = product.getUnitPrice().multiply(BigDecimal.valueOf(quantity));

        Order order = Order.builder()
                .user(buyer)
                .store(store)
                .status(orderStatus)
                .grandTotal(total)
                .paymentMethod(paymentMethod)
                .orderDate(orderDate)
                .build();
        order = orderRepository.save(order);

        OrderItem item = OrderItem.builder()
                .order(order)
                .product(product)
                .quantity(quantity)
                .price(total)
                .build();
        orderItemRepository.save(item);

        Shipment shipment = Shipment.builder()
                .order(order)
                .warehouse("Central " + store.getId())
                .mode("STANDARD")
                .trackingNumber("TRK-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase())
                .status(shipmentStatus)
                .estimatedDelivery(orderDate.toLocalDate().plusDays(5))
                .build();
        shipmentRepository.save(shipment);
    }
}
