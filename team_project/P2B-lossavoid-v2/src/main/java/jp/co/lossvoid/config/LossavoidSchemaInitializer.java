package jp.co.lossvoid.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

@Component
public class LossavoidSchemaInitializer implements ApplicationRunner {
    private final JdbcTemplate jdbcTemplate;

    public LossavoidSchemaInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        Integer tables = jdbcTemplate.queryForObject("""
            SELECT COUNT(*) FROM USER_TABLES
            WHERE TABLE_NAME IN ('MENUS', 'CUSTOMERS', 'ORDERS', 'COOKING_TASKS', 'STAFFS', 'STORES')
            """, Integer.class);
        if (tables == null || tables != 6) {
            throw new IllegalStateException("The selected Oracle user must have the lossavoid schema. "
                + "For a new database, run schema.sql first.");
        }
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(
            new ClassPathResource("db/lossavoid-upgrade.sql"));
        populator.setSqlScriptEncoding("UTF-8");
        populator.setSeparator("/");
        populator.execute(java.util.Objects.requireNonNull(jdbcTemplate.getDataSource()));
    }
}
