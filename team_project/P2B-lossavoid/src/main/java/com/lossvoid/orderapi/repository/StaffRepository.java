package com.lossvoid.orderapi.repository;

import com.lossvoid.orderapi.dto.StaffDto;
import com.lossvoid.orderapi.dto.StaffAccount;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class StaffRepository {
    private final JdbcTemplate jdbcTemplate;

    public StaffRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<StaffDto> findAll() {
        return jdbcTemplate.query("""
            SELECT STAFF_CODE, STAFF_NAME, ROLE, ENABLED
            FROM STAFF_MASTER
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
            FROM STAFF_MASTER
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

    public void create(StaffDto staff, String passwordHash) {
        jdbcTemplate.update("""
            INSERT INTO STAFF_MASTER (STAFF_CODE, STAFF_NAME, PASSWORD_HASH, ROLE, ENABLED)
            VALUES (?, ?, ?, ?, ?)
            """, staff.code(), staff.name(), passwordHash, staff.role(), staff.enabled() ? 1 : 0);
    }

    public int update(String code, StaffDto staff, String passwordHash) {
        if (passwordHash != null) {
            return jdbcTemplate.update("""
                UPDATE STAFF_MASTER
                SET STAFF_NAME = ?, PASSWORD_HASH = ?, ROLE = ?, ENABLED = ?
                WHERE STAFF_CODE = ?
                """, staff.name(), passwordHash, staff.role(), staff.enabled() ? 1 : 0, code);
        }
        return jdbcTemplate.update("""
            UPDATE STAFF_MASTER
            SET STAFF_NAME = ?, ROLE = ?, ENABLED = ?
            WHERE STAFF_CODE = ?
            """, staff.name(), staff.role(), staff.enabled() ? 1 : 0, code);
    }

    public int delete(String code) {
        return jdbcTemplate.update("DELETE FROM STAFF_MASTER WHERE STAFF_CODE = ?", code);
    }
}
