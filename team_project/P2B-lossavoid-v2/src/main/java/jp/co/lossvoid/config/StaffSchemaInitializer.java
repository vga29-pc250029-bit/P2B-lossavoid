package jp.co.lossvoid.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class StaffSchemaInitializer implements ApplicationRunner {
    private final JdbcTemplate jdbcTemplate;

    public StaffSchemaInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        addColumnIfMissing("PASSWORD_HASH", "VARCHAR2(100)");
        addColumnIfMissing("ROLE", "VARCHAR2(20) DEFAULT 'EMPLOYEE' NOT NULL");
        jdbcTemplate.update("UPDATE STAFF_MASTER SET ROLE = 'EMPLOYEE' WHERE ROLE IS NULL");
    }

    private void addColumnIfMissing(String columnName, String definition) {
        Integer count = jdbcTemplate.queryForObject("""
            SELECT COUNT(*)
            FROM USER_TAB_COLUMNS
            WHERE TABLE_NAME = 'STAFF_MASTER' AND COLUMN_NAME = ?
            """, Integer.class, columnName);
        if (count != null && count == 0) {
            jdbcTemplate.execute("ALTER TABLE STAFF_MASTER ADD " + columnName + " " + definition);
        }
    }
}
