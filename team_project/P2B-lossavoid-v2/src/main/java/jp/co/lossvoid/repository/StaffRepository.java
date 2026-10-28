package jp.co.lossvoid.repository;

import jp.co.lossvoid.bean.StaffDto;
import jp.co.lossvoid.bean.StaffAccount;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class StaffRepository {
    private final JdbcTemplate jdbcTemplate;
    private final int storeId;

    public StaffRepository(JdbcTemplate jdbcTemplate, @Value("${app.store-id:1}") int storeId) {
        this.jdbcTemplate = jdbcTemplate;
        this.storeId = storeId;
    }

    public List<StaffDto> findAll() {
        return jdbcTemplate.query("""
            SELECT STAFF_CODE, STAFF_NAME, ROLE, ENABLED
            FROM STAFFS
            ORDER BY STAFF_CODE
            """, (rs, rowNum) -> new StaffDto(
                rs.getString("STAFF_CODE"),
                rs.getString("STAFF_NAME"),
                rs.getString("ROLE"),
                rs.getInt("ENABLED") == 1
            ));
    }

    public Optional<StaffAccount> findAccount(String code) {
        List<StaffAccount> accounts = jdbcTemplate.query("""
            SELECT STAFF_CODE, STAFF_NAME, PASSWORD_HASH, ROLE, ENABLED
            FROM STAFFS
            WHERE UPPER(STAFF_CODE) = UPPER(?)
            """, (rs, rowNum) -> new StaffAccount(
                rs.getString("STAFF_CODE"),
                rs.getString("STAFF_NAME"),
                rs.getString("PASSWORD_HASH"),
                rs.getString("ROLE"),
                rs.getInt("ENABLED") == 1
            ), code);
        return accounts.stream().findFirst();
    }

    @Transactional
    public void create(StaffDto staff, String passwordHash) {
        jdbcTemplate.update("""
            MERGE INTO STORES target
            USING (SELECT ? AS STORE_ID FROM DUAL) source ON (target.STORE_ID = source.STORE_ID)
            WHEN NOT MATCHED THEN INSERT (STORE_ID, STORE_NAME, ENABLED)
            VALUES (source.STORE_ID, 'lossavoid', 1)
            """, storeId);
        jdbcTemplate.update("""
            INSERT INTO STAFFS (STAFF_ID, STORE_ID, STAFF_CODE, STAFF_NAME, PASSWORD_HASH, ROLE, ENABLED)
            VALUES (SEQ_STAFFS.NEXTVAL, ?, ?, ?, ?, ?, ?)
            """, storeId, staff.code(), staff.name(), passwordHash, staff.role(), staff.enabled() ? 1 : 0);
    }

    public int update(String code, StaffDto staff, String passwordHash) {
        if (passwordHash != null) {
            return jdbcTemplate.update("""
                UPDATE STAFFS
                SET STAFF_NAME = ?, PASSWORD_HASH = ?, ROLE = ?, ENABLED = ?
                WHERE STAFF_CODE = ?
                """, staff.name(), passwordHash, staff.role(), staff.enabled() ? 1 : 0, code);
        }
        return jdbcTemplate.update("""
            UPDATE STAFFS
            SET STAFF_NAME = ?, ROLE = ?, ENABLED = ?
            WHERE STAFF_CODE = ?
            """, staff.name(), staff.role(), staff.enabled() ? 1 : 0, code);
    }

    public int delete(String code) {
        return jdbcTemplate.update("DELETE FROM STAFFS WHERE STAFF_CODE = ?", code);
    }
}
