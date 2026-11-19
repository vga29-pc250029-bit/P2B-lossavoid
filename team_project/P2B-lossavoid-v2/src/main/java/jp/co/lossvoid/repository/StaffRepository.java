package jp.co.lossvoid.repository;

import jp.co.lossvoid.bean.StaffDto;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * 担当者の管理情報を保存・取得する。旧DBの認証情報は参照せず、そのまま保持する。
 */
@Repository
public class StaffRepository {
    // 既存DBのNOT NULL列を維持するための非認証用マーカー。パスワードとしては使用しない。
    private static final String NO_LOGIN_MARKER = "!NO_LOGIN!";
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

    // 担当者が参照する店舗を未登録時だけ作り、担当者を同じトランザクションで保存する。
    @Transactional
    public void create(StaffDto staff) {
        jdbcTemplate.update("""
            MERGE INTO STORES target
            USING (SELECT ? AS STORE_ID FROM DUAL) source ON (target.STORE_ID = source.STORE_ID)
            WHEN NOT MATCHED THEN INSERT (STORE_ID, STORE_NAME, ENABLED)
            VALUES (source.STORE_ID, 'lossavoid', 1)
            """, storeId);
        jdbcTemplate.update("""
            INSERT INTO STAFFS (STAFF_ID, STORE_ID, STAFF_CODE, STAFF_NAME, PASSWORD_HASH, ROLE, ENABLED)
            VALUES (SEQ_STAFFS.NEXTVAL, ?, ?, ?, ?, ?, ?)
            """, storeId, staff.code(), staff.name(), NO_LOGIN_MARKER, staff.role(), staff.enabled() ? 1 : 0);
    }

    // 旧認証情報の列は更新対象に含めず、登録済みデータを維持する。
    public int update(String code, StaffDto staff) {
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
