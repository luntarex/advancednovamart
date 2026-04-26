package com.novamart.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
@RequiredArgsConstructor
public class OrderStatusSchemaUpdater {

    private final JdbcTemplate jdbcTemplate;

    @Bean
    ApplicationRunner ensureCartStatusValue() {
        return args -> {
            String columnType = jdbcTemplate.query(
                    """
                    SELECT COLUMN_TYPE
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'orders'
                      AND COLUMN_NAME = 'status'
                    """,
                    rs -> rs.next() ? rs.getString("COLUMN_TYPE") : null
            );

            if (columnType == null) {
                return;
            }

            String normalized = columnType.toUpperCase();
            boolean isEnumColumn = normalized.startsWith("ENUM(");
            boolean hasCart = normalized.contains("'CART'");

            if (isEnumColumn && !hasCart) {
                jdbcTemplate.execute(
                        """
                        ALTER TABLE orders
                        MODIFY COLUMN status ENUM('CART','PENDING','PROCESSING','SHIPPED','DELIVERED','CANCELLED') NOT NULL
                        """
                );
            }
        };
    }
}
