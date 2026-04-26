package com.novamart.config;

import com.novamart.entity.*;
import com.novamart.enums.*;
import com.novamart.repository.*;
import com.opencsv.CSVReader;
import com.opencsv.CSVReaderBuilder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Component
@Profile("import")
@RequiredArgsConstructor
@Slf4j
public class DataLoader implements CommandLineRunner {

    private final UserRepository userRepository;
    private final CustomerProfileRepository customerProfileRepository;
    private final CategoryRepository categoryRepository;
    private final StoreRepository storeRepository;
    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final ReviewRepository reviewRepository;
    private final ShipmentRepository shipmentRepository;
    private final AddressRepository addressRepository;
    private final PasswordEncoder passwordEncoder;

    private static final int BATCH_SIZE = 500;
    private static final int LOG_INTERVAL = 5000;
    private static final int MAX_ROWS_PER_TABLE = 5000;
    private static final int RESERVED_ORDERS_FOR_SHIPMENTS = 1000;
    private static final int RESERVED_PRODUCTS_FOR_REVIEWS = 1200;

    private static final String TABLE_USERS = "users";
    private static final String TABLE_CUSTOMER_PROFILES = "customer_profiles";
    private static final String TABLE_CATEGORIES = "categories";
    private static final String TABLE_STORES = "stores";
    private static final String TABLE_PRODUCTS = "products";
    private static final String TABLE_ORDERS = "orders";
    private static final String TABLE_ORDER_ITEMS = "order_items";
    private static final String TABLE_REVIEWS = "reviews";
    private static final String TABLE_SHIPMENTS = "shipments";
    private static final String TABLE_ADDRESSES = "addresses";

    // In-memory caches to avoid repeated DB lookups
    private final Map<String, User> userCache = new HashMap<>();
    private final Map<String, Product> productCache = new HashMap<>();
    private final Map<String, Category> categoryCache = new HashMap<>();
    private final Map<String, Order> orderCache = new HashMap<>();
    private final Map<String, Store> storeCache = new HashMap<>();
    private final Map<String, Integer> tableCounts = new HashMap<>();

    private Store defaultStore;
    private String encodedPassword;

    @Override
    public void run(String... args) throws Exception {
        if (userRepository.count() > 0) {
            log.info("Database already contains data. Skipping import.");
            return;
        }

        log.info("========== DATA IMPORT STARTED ==========");
        long startTime = System.currentTimeMillis();

        encodedPassword = passwordEncoder.encode("novamart123");

        // Create system users + default store
        setupSystemData();
        initializeTableCounts();

        // Import datasets in dependency order
        importDS2_CustomerBehavior();
        importDS4_AmazonSales();
        importDS5_PakistanOrders();
        importDS3_ShippingData();
        importDS6_AmazonReviews();
        importDS1_OnlineRetail();

        long elapsed = (System.currentTimeMillis() - startTime) / 1000;
        log.info("========== DATA IMPORT COMPLETED in {} seconds ==========", elapsed);
        log.info("Final counts — Users: {}, Products: {}, Categories: {}, Orders: {}, Reviews: {}",
                userRepository.count(), productRepository.count(),
                categoryRepository.count(), orderRepository.count(), reviewRepository.count());
    }

    // =====================================================================
    // SYSTEM DATA
    // =====================================================================
    private void setupSystemData() {
        User admin = User.builder()
                .email("admin@novamart.com")
                .password(encodedPassword)
                .roleType(RoleType.ADMIN)
                .gender("Other")
                .build();
        admin = userRepository.save(admin);
        userCache.put(admin.getEmail(), admin);

        User corporate = User.builder()
                .email("store@novamart.com")
                .password(encodedPassword)
                .roleType(RoleType.CORPORATE)
                .gender("Other")
                .build();
        corporate = userRepository.save(corporate);
        userCache.put(corporate.getEmail(), corporate);

        defaultStore = Store.builder()
                .name("NovaMart Store")
                .owner(corporate)
                .status(StoreStatus.OPEN)
                .build();
        defaultStore = storeRepository.save(defaultStore);
        storeCache.put("default", defaultStore);

        log.info("System data created: admin + corporate user + default store");
    }

    // =====================================================================
    // DS2: E-Commerce Customer Behavior → Users + CustomerProfiles
    // =====================================================================
    private void importDS2_CustomerBehavior() {
        log.info("--- DS2: Importing Customer Behavior ---");
        int count = 0;
        try (CSVReader reader = openCsv("raw-datasets/E-Commerce Customer Behavior.csv")) {
            reader.readNext(); // skip header
            String[] line;
            while ((line = reader.readNext()) != null) {
                if (!hasRoom(TABLE_CUSTOMER_PROFILES)) break;
                try {
                    String customerId = line[0].trim();
                    String gender = line[1].trim();
                    int age = parseInt(line[2], 0);
                    String city = line[3].trim();
                    String membershipType = line[4].trim();
                    double totalSpend = parseDouble(line[5], 0.0);
                    int itemsPurchased = parseInt(line[6], 0);
                    double avgRating = parseDouble(line[7], 0.0);
                    boolean discountApplied = "TRUE".equalsIgnoreCase(line[8].trim());
                    String satisfactionLevel = line[10].trim();

                    String email = "customer" + customerId + "@novamart.com";
                    User user = getOrCreateUser(email, gender, RoleType.INDIVIDUAL);

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
                    incrementCount(TABLE_CUSTOMER_PROFILES);
                    count++;
                } catch (Exception e) {
                    // skip bad row
                }
            }
        } catch (Exception e) {
            log.error("Error importing DS2", e);
        }
        log.info("DS2 complete: {} customer profiles imported", count);
    }

    // =====================================================================
    // DS1: UCI Online Retail → Products, Orders, OrderItems
    // =====================================================================
    private void importDS1_OnlineRetail() {
        log.info("--- DS1: Importing Online Retail ---");
        Category retailCategory = getOrCreateCategory("Online Retail");
        int itemCount = 0;
        List<OrderItem> itemBatch = new ArrayList<>();

        try (CSVReader reader = openCsv("raw-datasets/E-Commerce Sales Forecast (UCI Online Retail).csv")) {
            reader.readNext(); // skip header
            String[] line;
            while ((line = reader.readNext()) != null) {
                if (!hasRoom(TABLE_ORDER_ITEMS)) break;
                try {
                    if (line.length < 8) continue;
                    String invoiceNo = line[0].trim();
                    String stockCode = line[1].trim();
                    String description = line[2].trim();
                    int quantity = parseInt(line[3], 0);
                    String invoiceDateStr = line[4].trim();
                    double unitPrice = parseDouble(line[5], 0.0);
                    String customerIdStr = line[6].trim();
                    String country = line[7].trim();

                    // Skip returns (negative qty) and zero-price items
                    if (quantity <= 0 || unitPrice <= 0) continue;
                    if (invoiceNo.startsWith("C")) continue; // cancellation

                    // User
                    User user;
                    if (!customerIdStr.isEmpty()) {
                        String email = "retail" + customerIdStr + "@novamart.com";
                        user = getOrCreateUser(email, null, RoleType.INDIVIDUAL);
                    } else {
                        user = getOrCreateUser("retail-guest-" + invoiceNo + "@novamart.com", null, RoleType.INDIVIDUAL);
                    }

                    Store store = getOrCreateStore("retail-" + normalizeKey(country),
                            "Retail " + (country.isBlank() ? "Global" : country.trim()));

                    // Product
                    Product product = getOrCreateProduct(stockCode, description,
                            BigDecimal.valueOf(unitPrice), retailCategory, store, true);

                    // Order (group by InvoiceNo)
                    Order order = orderCache.get("DS1-" + invoiceNo);
                    if (order == null) {
                        if (!hasRoomWithReserve(TABLE_ORDERS, RESERVED_ORDERS_FOR_SHIPMENTS)) continue;
                        LocalDateTime orderDate = parseDateTime(invoiceDateStr);
                        order = Order.builder()
                                .user(user)
                                .store(store)
                                .status(OrderStatus.DELIVERED)
                                .grandTotal(BigDecimal.ZERO)
                                .paymentMethod("Card")
                                .orderDate(orderDate)
                                .build();
                        order = orderRepository.save(order);
                        incrementCount(TABLE_ORDERS);
                        orderCache.put("DS1-" + invoiceNo, order);
                    }

                    // OrderItem
                    BigDecimal lineTotal = BigDecimal.valueOf(unitPrice * quantity);
                    OrderItem item = OrderItem.builder()
                            .order(order)
                            .product(product)
                            .quantity(quantity)
                            .price(lineTotal)
                            .build();
                    itemBatch.add(item);
                    itemCount++;

                    if (itemBatch.size() >= BATCH_SIZE) {
                        int allowed = remainingSlots(TABLE_ORDER_ITEMS);
                        if (allowed <= 0) {
                            itemBatch.clear();
                            break;
                        }
                        List<OrderItem> toSave = itemBatch.size() > allowed ? itemBatch.subList(0, allowed) : itemBatch;
                        orderItemRepository.saveAll(toSave);
                        incrementCount(TABLE_ORDER_ITEMS, toSave.size());
                        itemBatch.clear();
                    }
                    if (itemCount % LOG_INTERVAL == 0) {
                        log.info("DS1 progress: {} items processed", itemCount);
                    }
                } catch (Exception e) {
                    // skip bad row
                }
            }
            if (!itemBatch.isEmpty()) {
                int allowed = remainingSlots(TABLE_ORDER_ITEMS);
                if (allowed > 0) {
                    List<OrderItem> toSave = itemBatch.size() > allowed ? itemBatch.subList(0, allowed) : itemBatch;
                    orderItemRepository.saveAll(toSave);
                    incrementCount(TABLE_ORDER_ITEMS, toSave.size());
                }
            }
        } catch (Exception e) {
            log.error("Error importing DS1", e);
        }
        log.info("DS1 complete: {} order items imported", itemCount);
    }

    // =====================================================================
    // DS4: Amazon Sales → Categories, Products, Orders, OrderItems
    // =====================================================================
    private void importDS4_AmazonSales() {
        log.info("--- DS4: Importing Amazon Sales ---");
        int itemCount = 0;
        List<OrderItem> itemBatch = new ArrayList<>();

        try (CSVReader reader = openCsv("raw-datasets/E-Commerce Sales (Amazon).csv")) {
            reader.readNext(); // skip header
            String[] line;
            while ((line = reader.readNext()) != null) {
                if (!hasRoom(TABLE_ORDER_ITEMS)) break;
                try {
                    if (line.length < 16) continue;
                    String orderId = line[1].trim();
                    String dateStr = line[2].trim();
                    String statusStr = line[3].trim();
                    String sku = line[8].trim();
                    String categoryName = line[9].trim();
                    int qty = parseInt(line[13], 0);
                    double amount = parseDouble(line[15], 0.0);
                    String shipCity = line.length > 16 ? line[16].trim() : "";
                    String shipState = line.length > 17 ? line[17].trim() : "";

                    if (sku.isEmpty() || qty <= 0) continue;

                    Category category = getOrCreateCategory(categoryName);
                    String stateKey = shipState.isBlank() ? "unknown" : shipState;
                    User amazonUser = getOrCreateUser("amazon-" + normalizeKey(orderId + "-" + stateKey + "-" + shipCity) + "@novamart.com",
                            null, RoleType.INDIVIDUAL);
                    Store store = getOrCreateStore("amazon-" + normalizeKey(stateKey),
                            "Amazon " + (shipState.isBlank() ? "Unknown" : shipState.trim()));
                    Product product = getOrCreateProduct(sku, sku, BigDecimal.valueOf(amount > 0 ? amount : 1.0), category, store, true);

                    // Order
                    Order order = orderCache.get("DS4-" + orderId);
                    if (order == null) {
                        if (!hasRoomWithReserve(TABLE_ORDERS, RESERVED_ORDERS_FOR_SHIPMENTS)) continue;
                        OrderStatus status = mapOrderStatus(statusStr);
                        LocalDateTime orderDate = parseDateFlexible(dateStr);
                        order = Order.builder()
                                .user(amazonUser)
                                .store(store)
                                .status(status)
                                .grandTotal(BigDecimal.valueOf(amount))
                                .paymentMethod("Amazon Pay")
                                .orderDate(orderDate)
                                .build();
                        order = orderRepository.save(order);
                        incrementCount(TABLE_ORDERS);
                        orderCache.put("DS4-" + orderId, order);

                        // Address
                        if (!shipCity.isEmpty() && hasRoom(TABLE_ADDRESSES)) {
                            Address address = Address.builder()
                                    .user(amazonUser)
                                    .addressLine(shipCity + ", " + shipState)
                                    .city(shipCity.length() > 60 ? shipCity.substring(0, 60) : shipCity)
                                    .district(shipState.length() > 60 ? shipState.substring(0, 60) : shipState)
                                    .build();
                            addressRepository.save(address);
                            incrementCount(TABLE_ADDRESSES);
                        }
                    }

                    OrderItem item = OrderItem.builder()
                            .order(order)
                            .product(product)
                            .quantity(qty)
                            .price(BigDecimal.valueOf(amount))
                            .build();
                    itemBatch.add(item);
                    itemCount++;

                    if (itemBatch.size() >= BATCH_SIZE) {
                        int allowed = remainingSlots(TABLE_ORDER_ITEMS);
                        if (allowed <= 0) {
                            itemBatch.clear();
                            break;
                        }
                        List<OrderItem> toSave = itemBatch.size() > allowed ? itemBatch.subList(0, allowed) : itemBatch;
                        orderItemRepository.saveAll(toSave);
                        incrementCount(TABLE_ORDER_ITEMS, toSave.size());
                        itemBatch.clear();
                    }
                    if (itemCount % LOG_INTERVAL == 0) {
                        log.info("DS4 progress: {} items processed", itemCount);
                    }
                } catch (Exception e) {
                    // skip bad row
                }
            }
            if (!itemBatch.isEmpty()) {
                int allowed = remainingSlots(TABLE_ORDER_ITEMS);
                if (allowed > 0) {
                    List<OrderItem> toSave = itemBatch.size() > allowed ? itemBatch.subList(0, allowed) : itemBatch;
                    orderItemRepository.saveAll(toSave);
                    incrementCount(TABLE_ORDER_ITEMS, toSave.size());
                }
            }
        } catch (Exception e) {
            log.error("Error importing DS4", e);
        }
        log.info("DS4 complete: {} order items imported", itemCount);
    }

    // =====================================================================
    // DS5: Pakistan E-Commerce → Orders, OrderItems, Categories
    // =====================================================================
    private void importDS5_PakistanOrders() {
        log.info("--- DS5: Importing Pakistan Orders ---");
        int itemCount = 0;
        List<OrderItem> itemBatch = new ArrayList<>();

        try (CSVReader reader = openCsv("raw-datasets/Pakistan E-commerce Orders.csv")) {
            reader.readNext(); // skip header
            String[] line;
            while ((line = reader.readNext()) != null) {
                if (!hasRoom(TABLE_ORDER_ITEMS)) break;
                try {
                    if (line.length < 21) continue;
                    String statusStr = line[1].trim();
                    String createdAt = line[2].trim();
                    String sku = line[3].trim();
                    double price = parseDouble(line[4], 0.0);
                    int qtyOrdered = parseInt(line[5], 0);
                    double grandTotal = parseDouble(line[6], 0.0);
                    String categoryName = line[8].trim();
                    String paymentMethod = line[11].trim();
                    String customerIdStr = line.length > 20 ? line[20].trim() : "";

                    if (sku.isEmpty() || sku.equals("\\N") || qtyOrdered <= 0) continue;

                    Category category = getOrCreateCategory(categoryName);

                    // User
                    User user;
                    if (!customerIdStr.isEmpty() && !customerIdStr.equals("\\N")) {
                        String email = "pk" + customerIdStr + "@novamart.com";
                        user = getOrCreateUser(email, null, RoleType.INDIVIDUAL);
                    } else {
                        user = getOrCreateUser("pk-guest-" + normalizeKey(line[7]) + "@novamart.com", null, RoleType.INDIVIDUAL);
                    }

                    OrderStatus status = mapOrderStatus(statusStr);
                    LocalDateTime orderDate = parseDateFlexible(createdAt);
                    if (!hasRoomWithReserve(TABLE_ORDERS, RESERVED_ORDERS_FOR_SHIPMENTS)) continue;
                    Store store = getOrCreateStore("pk-" + normalizeKey(categoryName),
                            "Pakistan " + (categoryName.isBlank() ? "General" : categoryName.trim()));
                    Product product = getOrCreateProduct("PK-" + sku, sku,
                            BigDecimal.valueOf(price > 0 ? price : 1.0), category, store, true);

                    Order order = Order.builder()
                            .user(user)
                            .store(store)
                            .status(status)
                            .grandTotal(BigDecimal.valueOf(grandTotal))
                            .paymentMethod(paymentMethod.length() > 50 ? paymentMethod.substring(0, 50) : paymentMethod)
                            .orderDate(orderDate)
                            .build();
                    order = orderRepository.save(order);
                    incrementCount(TABLE_ORDERS);

                    OrderItem item = OrderItem.builder()
                            .order(order)
                            .product(product)
                            .quantity(qtyOrdered)
                            .price(BigDecimal.valueOf(price * qtyOrdered))
                            .build();
                    itemBatch.add(item);
                    itemCount++;

                    if (itemBatch.size() >= BATCH_SIZE) {
                        int allowed = remainingSlots(TABLE_ORDER_ITEMS);
                        if (allowed <= 0) {
                            itemBatch.clear();
                            break;
                        }
                        List<OrderItem> toSave = itemBatch.size() > allowed ? itemBatch.subList(0, allowed) : itemBatch;
                        orderItemRepository.saveAll(toSave);
                        incrementCount(TABLE_ORDER_ITEMS, toSave.size());
                        itemBatch.clear();
                    }
                    if (itemCount % LOG_INTERVAL == 0) {
                        log.info("DS5 progress: {} items processed", itemCount);
                    }
                } catch (Exception e) {
                    // skip bad row
                }
            }
            if (!itemBatch.isEmpty()) {
                int allowed = remainingSlots(TABLE_ORDER_ITEMS);
                if (allowed > 0) {
                    List<OrderItem> toSave = itemBatch.size() > allowed ? itemBatch.subList(0, allowed) : itemBatch;
                    orderItemRepository.saveAll(toSave);
                    incrementCount(TABLE_ORDER_ITEMS, toSave.size());
                }
            }
        } catch (Exception e) {
            log.error("Error importing DS5", e);
        }
        log.info("DS5 complete: {} order items imported", itemCount);
    }

    // =====================================================================
    // DS3: Shipping Data → Shipments (with synthetic Orders)
    // =====================================================================
    private void importDS3_ShippingData() {
        log.info("--- DS3: Importing Shipping Data ---");
        int count = 0;

        try (CSVReader reader = openCsv("raw-datasets/E-Commerce Shipping Data.csv")) {
            reader.readNext(); // skip header
            String[] line;
            while ((line = reader.readNext()) != null) {
                if (!hasRoom(TABLE_SHIPMENTS) || !hasRoom(TABLE_ORDERS)) break;
                try {
                    if (line.length < 12) continue;
                    String warehouse = line[1].trim();
                    String modeOfShipment = line[2].trim();
                    int customerRating = parseInt(line[4], 3);
                    double costOfProduct = parseDouble(line[5], 0.0);
                    String gender = line[8].trim();
                    int discount = parseInt(line[9], 0);
                    int reachedOnTime = parseInt(line[11], 0);

                    // Create user
                    String email = "ship" + count + "@novamart.com";
                    User user = getOrCreateUser(email, gender.equals("F") ? "Female" : "Male", RoleType.INDIVIDUAL);
                    Store store = getOrCreateStore("warehouse-" + normalizeKey(warehouse), "Warehouse " + warehouse);

                    // Create order
                    BigDecimal total = BigDecimal.valueOf(costOfProduct - discount);
                    if (total.compareTo(BigDecimal.ZERO) < 0) total = BigDecimal.valueOf(costOfProduct);
                    Order order = Order.builder()
                            .user(user)
                            .store(store)
                            .status(reachedOnTime == 1 ? OrderStatus.DELIVERED : OrderStatus.SHIPPED)
                            .grandTotal(total)
                            .paymentMethod("Standard")
                            .build();
                    order = orderRepository.save(order);
                    incrementCount(TABLE_ORDERS);

                    // Shipment
                    ShipmentStatus shipStatus = reachedOnTime == 1 ? ShipmentStatus.DELIVERED : ShipmentStatus.IN_TRANSIT;
                    Shipment shipment = Shipment.builder()
                            .order(order)
                            .warehouse("Block " + warehouse)
                            .mode(modeOfShipment)
                            .trackingNumber("TRK-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase())
                            .status(shipStatus)
                            .estimatedDelivery(LocalDate.now().plusDays(reachedOnTime == 1 ? 0 : 7))
                            .build();
                    shipmentRepository.save(shipment);
                    incrementCount(TABLE_SHIPMENTS);

                    count++;
                    if (count % LOG_INTERVAL == 0) {
                        log.info("DS3 progress: {} shipments processed", count);
                    }
                } catch (Exception e) {
                    // skip bad row
                }
            }
        } catch (Exception e) {
            log.error("Error importing DS3", e);
        }
        log.info("DS3 complete: {} shipments imported", count);
    }

    // =====================================================================
    // DS6: Amazon US Customer Reviews → Reviews
    // =====================================================================
    private void importDS6_AmazonReviews() {
        log.info("--- DS6: Importing Amazon Reviews ---");
        int count = 0;
        List<Review> reviewBatch = new ArrayList<>();

        try (CSVReader reader = openCsv("raw-datasets/amazon us customer reviews.csv")) {
            reader.readNext(); // skip header
            String[] line;
            while ((line = reader.readNext()) != null) {
                if (!hasRoom(TABLE_REVIEWS)) break;
                try {
                    if (line.length < 15) continue;
                    String customerId = line[1].trim();
                    String productId = line[3].trim();
                    String productTitle = line[5].trim();
                    String productCategory = line[6].trim();
                    int starRating = parseInt(line[7], 3);
                    int helpfulVotes = parseInt(line[8], 0);
                    String reviewHeadline = line[12].trim();
                    String reviewBody = line[13].trim();

                    if (productId.isEmpty() || customerId.isEmpty()) continue;

                    // Category
                    Category category = getOrCreateCategory(productCategory);
                    Store store = getOrCreateStore("reviews-" + normalizeKey(productCategory),
                            "Reviews " + (productCategory == null || productCategory.isBlank() ? "General" : productCategory.trim()));

                    // Product
                    Product product = getOrCreateProduct(productId,
                            productTitle.length() > 255 ? productTitle.substring(0, 255) : productTitle,
                            BigDecimal.ONE, category, store, false);

                    // User
                    String email = "reviewer" + customerId + "@novamart.com";
                    User user = getOrCreateUser(email, null, RoleType.INDIVIDUAL);

                    // Determine sentiment from star rating
                    String sentiment;
                    if (starRating >= 4) sentiment = "Positive";
                    else if (starRating == 3) sentiment = "Neutral";
                    else sentiment = "Negative";

                    Review review = Review.builder()
                            .user(user)
                            .product(product)
                            .starRating(starRating)
                            .helpfulVotes(helpfulVotes)
                            .reviewText(reviewBody)
                            .sentiment(sentiment)
                            .visibility("PUBLIC")
                            .build();
                    reviewBatch.add(review);
                    count++;

                    if (reviewBatch.size() >= BATCH_SIZE) {
                        int allowed = remainingSlots(TABLE_REVIEWS);
                        if (allowed <= 0) {
                            reviewBatch.clear();
                            break;
                        }
                        List<Review> toSave = reviewBatch.size() > allowed ? reviewBatch.subList(0, allowed) : reviewBatch;
                        reviewRepository.saveAll(toSave);
                        incrementCount(TABLE_REVIEWS, toSave.size());
                        reviewBatch.clear();
                    }
                    if (count % LOG_INTERVAL == 0) {
                        log.info("DS6 progress: {} reviews processed", count);
                    }
                } catch (Exception e) {
                    // skip bad row
                }
            }
            if (!reviewBatch.isEmpty()) {
                int allowed = remainingSlots(TABLE_REVIEWS);
                if (allowed > 0) {
                    List<Review> toSave = reviewBatch.size() > allowed ? reviewBatch.subList(0, allowed) : reviewBatch;
                    reviewRepository.saveAll(toSave);
                    incrementCount(TABLE_REVIEWS, toSave.size());
                }
            }
        } catch (Exception e) {
            log.error("Error importing DS6", e);
        }
        log.info("DS6 complete: {} reviews imported", count);
    }

    // =====================================================================
    // HELPER METHODS
    // =====================================================================

    private CSVReader openCsv(String path) throws Exception {
        ClassPathResource resource = new ClassPathResource(path);
        return new CSVReaderBuilder(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))
                .build();
    }

    private User getOrCreateUser(String email, String gender, RoleType role) {
        User cached = userCache.get(email);
        if (cached != null) return cached;

        if (!hasRoom(TABLE_USERS)) {
            User fallback = pickExistingUserByHash(role, email);
            if (fallback != null) return fallback;
            return userCache.values().stream().findFirst().orElse(userCache.get("store@novamart.com"));
        }

        User user = User.builder()
                .email(email)
                .password(encodedPassword)
                .roleType(role)
                .gender(gender)
                .build();
        user = userRepository.save(user);
        incrementCount(TABLE_USERS);
        userCache.put(email, user);
        return user;
    }

    private Category getOrCreateCategory(String name) {
        if (name == null || name.isBlank() || name.equals("\\N")) name = "Uncategorized";
        String key = name.trim();

        Category cached = categoryCache.get(key);
        if (cached != null) return cached;

        if (!hasRoom(TABLE_CATEGORIES)) {
            Category fallback = categoryCache.get("Uncategorized");
            if (fallback != null) return fallback;
            return categoryCache.values().stream().findFirst().orElse(null);
        }

        Category parent = resolveCategoryParent(key);
        Category cat = Category.builder().name(key).parent(parent).build();
        cat = categoryRepository.save(cat);
        incrementCount(TABLE_CATEGORIES);
        categoryCache.put(key, cat);
        return cat;
    }

    private Store getOrCreateStore(String key, String name) {
        String normalizedKey = normalizeKey(key);
        Store cached = storeCache.get(normalizedKey);
        if (cached != null) return cached;

        if (!hasRoom(TABLE_STORES)) {
            return storeCache.values().stream().findFirst().orElse(defaultStore);
        }

        User owner = getOrCreateUser("corp-" + normalizedKey + "@novamart.com", null, RoleType.CORPORATE);
        Store store = Store.builder()
                .name((name == null || name.isBlank()) ? "NovaMart " + normalizedKey : truncate(name, 255))
                .owner(owner)
                .status(StoreStatus.OPEN)
                .build();
        store = storeRepository.save(store);
        incrementCount(TABLE_STORES);
        storeCache.put(normalizedKey, store);
        return store;
    }

    private Product getOrCreateProduct(String sku, String name, BigDecimal unitPrice, Category category, Store store) {
        return getOrCreateProduct(sku, name, unitPrice, category, store, false);
    }

    private Product getOrCreateProduct(String sku, String name, BigDecimal unitPrice, Category category, Store store, boolean keepReviewReserve) {
        if (sku == null || sku.isBlank()) sku = "UNKNOWN-" + UUID.randomUUID().toString().substring(0, 8);
        String safeStoreKey = (store != null && store.getId() != null) ? String.valueOf(store.getId()) : "default";
        String cacheKey = safeStoreKey + "|" + sku;
        Product cached = productCache.get(cacheKey);
        if (cached != null) return cached;

        if (keepReviewReserve) {
            if (!hasRoomWithReserve(TABLE_PRODUCTS, RESERVED_PRODUCTS_FOR_REVIEWS)) {
                return pickExistingProductByHash(cacheKey);
            }
        } else if (!hasRoom(TABLE_PRODUCTS)) {
            return pickExistingProductByHash(cacheKey);
        }

        String scopedSku = buildScopedSku(sku, safeStoreKey);
        Product product = Product.builder()
                .sku(scopedSku)
                .name(name != null && !name.isBlank() ? name : sku)
                .description(name)
                .unitPrice(unitPrice != null ? unitPrice : BigDecimal.ZERO)
                .stockQuantity(1000)
                .category(category)
                .store(store != null ? store : defaultStore)
                .build();
        product = productRepository.save(product);
        incrementCount(TABLE_PRODUCTS);
        productCache.put(cacheKey, product);
        return product;
    }

    private Product pickExistingProductByHash(String seed) {
        if (productCache.isEmpty()) return null;
        List<Product> products = new ArrayList<>(productCache.values());
        int idx = Math.abs(Objects.hash(seed, "product")) % products.size();
        return products.get(idx);
    }

    private String buildScopedSku(String baseSku, String storeKey) {
        String normalizedSku = truncate(baseSku, 180);
        String suffix = "_S" + storeKey;
        String candidate = normalizedSku + suffix;
        if (candidate.length() <= 255) return candidate;
        int maxBaseLength = Math.max(1, 255 - suffix.length());
        return normalizedSku.substring(0, Math.min(normalizedSku.length(), maxBaseLength)) + suffix;
    }

    private Category resolveCategoryParent(String categoryName) {
        String normalized = normalizeKey(categoryName);
        String parentName;

        if (normalized.contains("fashion") || normalized.contains("apparel") || normalized.contains("clothing")
                || normalized.contains("set") || normalized.contains("kurta")) {
            parentName = "Fashion";
        } else if (normalized.contains("beauty") || normalized.contains("personal_care")) {
            parentName = "Beauty";
        } else if (normalized.contains("electronics") || normalized.contains("computer")
                || normalized.contains("wireless") || normalized.contains("accessory")) {
            parentName = "Electronics";
        } else if (normalized.contains("home") || normalized.contains("kitchen") || normalized.contains("furniture")) {
            parentName = "Home";
        } else if (normalized.contains("book") || normalized.contains("video") || normalized.contains("music")
                || normalized.contains("dvd")) {
            parentName = "Media";
        } else if (normalized.contains("grocery") || normalized.contains("food")) {
            parentName = "Grocery";
        } else if (normalized.contains("toy") || normalized.contains("game")) {
            parentName = "Toys";
        } else if (normalized.contains("sports")) {
            parentName = "Sports";
        } else if (normalized.contains("automotive")) {
            parentName = "Automotive";
        } else {
            parentName = "General";
        }

        if (categoryName.equalsIgnoreCase(parentName)) {
            return null;
        }
        return getOrCreateCategory(parentName);
    }

    private User pickExistingUserByHash(RoleType role, String seed) {
        List<User> sameRoleUsers = userCache.values().stream()
                .filter(u -> u.getRoleType() == role)
                .toList();
        if (!sameRoleUsers.isEmpty()) {
            int idx = Math.abs(Objects.hash(seed)) % sameRoleUsers.size();
            return sameRoleUsers.get(idx);
        }

        List<User> individuals = userCache.values().stream()
                .filter(u -> u.getRoleType() == RoleType.INDIVIDUAL)
                .toList();
        if (!individuals.isEmpty()) {
            int idx = Math.abs(Objects.hash(seed, "individual")) % individuals.size();
            return individuals.get(idx);
        }
        return null;
    }

    private String normalizeKey(String raw) {
        if (raw == null || raw.isBlank()) return "unknown";
        return raw.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_");
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return null;
        return s.length() <= maxLen ? s : s.substring(0, maxLen);
    }

    private void initializeTableCounts() {
        tableCounts.put(TABLE_USERS, (int) userRepository.count());
        tableCounts.put(TABLE_CUSTOMER_PROFILES, (int) customerProfileRepository.count());
        tableCounts.put(TABLE_CATEGORIES, (int) categoryRepository.count());
        tableCounts.put(TABLE_STORES, (int) storeRepository.count());
        tableCounts.put(TABLE_PRODUCTS, (int) productRepository.count());
        tableCounts.put(TABLE_ORDERS, (int) orderRepository.count());
        tableCounts.put(TABLE_ORDER_ITEMS, (int) orderItemRepository.count());
        tableCounts.put(TABLE_REVIEWS, (int) reviewRepository.count());
        tableCounts.put(TABLE_SHIPMENTS, (int) shipmentRepository.count());
        tableCounts.put(TABLE_ADDRESSES, (int) addressRepository.count());
    }

    private boolean hasRoom(String table) {
        return tableCounts.getOrDefault(table, 0) < MAX_ROWS_PER_TABLE;
    }

    private boolean hasRoomWithReserve(String table, int reserve) {
        int maxAllowed = Math.max(0, MAX_ROWS_PER_TABLE - Math.max(0, reserve));
        return tableCounts.getOrDefault(table, 0) < maxAllowed;
    }

    private int remainingSlots(String table) {
        return Math.max(0, MAX_ROWS_PER_TABLE - tableCounts.getOrDefault(table, 0));
    }

    private void incrementCount(String table) {
        incrementCount(table, 1);
    }

    private void incrementCount(String table, int amount) {
        if (amount <= 0) return;
        int current = tableCounts.getOrDefault(table, 0);
        tableCounts.put(table, Math.min(MAX_ROWS_PER_TABLE, current + amount));
    }

    private OrderStatus mapOrderStatus(String raw) {
        if (raw == null) return OrderStatus.PENDING;
        String s = raw.toLowerCase().trim();
        if (s.contains("deliver")) return OrderStatus.DELIVERED;
        if (s.contains("ship")) return OrderStatus.SHIPPED;
        if (s.contains("cancel")) return OrderStatus.CANCELLED;
        if (s.contains("process") || s.contains("complete")) return OrderStatus.PROCESSING;
        if (s.contains("pending")) return OrderStatus.PENDING;
        return OrderStatus.PROCESSING;
    }

    private LocalDateTime parseDateTime(String raw) {
        if (raw == null || raw.isBlank()) return LocalDateTime.now();
        try {
            // Format: "12/1/2010 8:26"
            DateTimeFormatter fmt = DateTimeFormatter.ofPattern("M/d/yyyy H:mm");
            return LocalDateTime.parse(raw.trim(), fmt);
        } catch (Exception e) {
            return parseDateFlexible(raw);
        }
    }

    private LocalDateTime parseDateFlexible(String raw) {
        if (raw == null || raw.isBlank()) return LocalDateTime.now();
        String s = raw.trim();
        // Try multiple date formats
        String[] patterns = {
                "M/d/yyyy H:mm", "M/d/yyyy", "MM-dd-yy", "yyyy-MM-dd",
                "dd-MM-yyyy", "MM/dd/yyyy", "d/M/yyyy"
        };
        for (String pattern : patterns) {
            try {
                if (pattern.contains("H")) {
                    return LocalDateTime.parse(s, DateTimeFormatter.ofPattern(pattern));
                } else {
                    return LocalDate.parse(s, DateTimeFormatter.ofPattern(pattern)).atStartOfDay();
                }
            } catch (Exception ignored) {
            }
        }
        return LocalDateTime.now();
    }

    private int parseInt(String s, int defaultVal) {
        if (s == null || s.isBlank() || s.equals("\\N")) return defaultVal;
        try {
            return (int) Double.parseDouble(s.trim().replaceAll("[^\\d.-]", ""));
        } catch (Exception e) {
            return defaultVal;
        }
    }

    private double parseDouble(String s, double defaultVal) {
        if (s == null || s.isBlank() || s.equals("\\N")) return defaultVal;
        try {
            return Double.parseDouble(s.trim().replaceAll("[^\\d.-]", ""));
        } catch (Exception e) {
            return defaultVal;
        }
    }
}
