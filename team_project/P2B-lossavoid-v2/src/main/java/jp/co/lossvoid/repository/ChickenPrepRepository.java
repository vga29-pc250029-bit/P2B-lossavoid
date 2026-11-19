package jp.co.lossvoid.repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ChickenPrepRepository {
    public record Stock(int ready, int pending, int customerDemand) { }
    public record Batch(Long id, int requestedQty, int remainingQty, int wastedQty, String status,
            String source, LocalDateTime requestedAt, LocalDateTime startedAt,
            LocalDateTime readyAt, LocalDateTime expiresAt) { }

    private final JdbcTemplate jdbcTemplate;

    public ChickenPrepRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void lockControl() {
        jdbcTemplate.queryForObject(
            "SELECT CONTROL_ID FROM CHICKEN_PREP_CONTROL WHERE CONTROL_ID = 1 FOR UPDATE", Integer.class);
    }

    public int expire(LocalDateTime now) {
        return jdbcTemplate.update("""
            UPDATE CHICKEN_PREP_BATCHES
            SET STATUS = 'EXPIRED', WASTED_QTY = REMAINING_QTY, REMAINING_QTY = 0
            WHERE STATUS = 'READY' AND EXPIRES_AT <= ?
            """, Timestamp.valueOf(now));
    }

    public int lapseStale(LocalDateTime now) {
        return jdbcTemplate.update("""
            UPDATE CHICKEN_PREP_BATCHES SET STATUS = 'LAPSED'
            WHERE STATUS IN ('REQUESTED', 'COOKING') AND REQUESTED_AT < ?
            """, Timestamp.valueOf(now.toLocalDate().atStartOfDay()));
    }

    public Stock stock(LocalDateTime now) {
        int ready = jdbcTemplate.queryForObject("""
            SELECT NVL(SUM(REMAINING_QTY), 0) FROM CHICKEN_PREP_BATCHES
            WHERE STATUS = 'READY' AND EXPIRES_AT > ?
            """, Integer.class, Timestamp.valueOf(now));
        int pending = jdbcTemplate.queryForObject("""
            SELECT NVL(SUM(REQUESTED_QTY), 0) FROM CHICKEN_PREP_BATCHES
            WHERE STATUS IN ('REQUESTED', 'COOKING')
            """, Integer.class);
        int customerDemand = jdbcTemplate.queryForObject("""
            SELECT NVL(SUM(d.QUANTITY), 0)
            FROM ORDER_DETAILS d
            JOIN ORDERS o ON o.ORDER_ID = d.ORDER_ID
            LEFT JOIN COOKING_TASKS t ON t.ORDER_DETAIL_ID = d.ORDER_DETAIL_ID
            WHERE d.MENU_ID IN (2402, 2404) AND d.QUANTITY > 0
              AND o.ORDER_STATUS NOT IN ('CANCELED', 'CLOSED')
              AND o.ORDER_TIME >= ?
              AND (o.ORDER_METHOD IS NULL OR o.ORDER_METHOD NOT LIKE 'KDS_COMPARE%')
              AND COALESCE(t.STATUS, 'WAITING') IN ('WAITING', 'COOKING')
            """, Integer.class, Timestamp.valueOf(now.minusHours(2)));
        return new Stock(ready, pending, customerDemand);
    }

    public int readyAt(LocalDateTime expectedReadyAt) {
        return jdbcTemplate.queryForObject("""
            SELECT NVL(SUM(REMAINING_QTY), 0) FROM CHICKEN_PREP_BATCHES
            WHERE STATUS = 'READY' AND EXPIRES_AT > ?
            """, Integer.class, Timestamp.valueOf(expectedReadyAt));
    }

    public Long request(int quantity, LocalDateTime now) {
        Long id = jdbcTemplate.queryForObject("SELECT SEQ_CHICKEN_PREP_BATCHES.NEXTVAL FROM DUAL", Long.class);
        jdbcTemplate.update("""
            INSERT INTO CHICKEN_PREP_BATCHES
                (BATCH_ID, REQUESTED_QTY, REMAINING_QTY, WASTED_QTY, STATUS, SOURCE, REQUESTED_AT)
            VALUES (?, ?, 0, 0, 'REQUESTED', 'SYSTEM', ?)
            """, id, quantity, Timestamp.valueOf(now));
        return id;
    }

    public int start(Long id, LocalDateTime now) {
        return jdbcTemplate.update("""
            UPDATE CHICKEN_PREP_BATCHES SET STATUS = 'COOKING', STARTED_AT = ?
            WHERE BATCH_ID = ? AND STATUS = 'REQUESTED' AND REQUESTED_AT >= ?
            """, Timestamp.valueOf(now), id, Timestamp.valueOf(now.toLocalDate().atStartOfDay()));
    }

    public int ready(Long id, LocalDateTime now, LocalDateTime expiresAt, LocalDateTime latestStartAt) {
        return jdbcTemplate.update("""
            UPDATE CHICKEN_PREP_BATCHES
            SET STATUS = 'READY', READY_AT = ?, EXPIRES_AT = ?, REMAINING_QTY = REQUESTED_QTY
            WHERE BATCH_ID = ? AND STATUS = 'COOKING' AND STARTED_AT <= ? AND REQUESTED_AT >= ?
            """, Timestamp.valueOf(now), Timestamp.valueOf(expiresAt), id,
            Timestamp.valueOf(latestStartAt), Timestamp.valueOf(now.toLocalDate().atStartOfDay()));
    }

    public int discard(Long id) {
        return jdbcTemplate.update("""
            UPDATE CHICKEN_PREP_BATCHES SET STATUS = 'DISCARDED'
            WHERE BATCH_ID = ? AND STATUS = 'EXPIRED'
            """, id);
    }

    public boolean isChickenDetail(Long detailId) {
        Integer count = jdbcTemplate.queryForObject("""
            SELECT COUNT(*) FROM ORDER_DETAILS d
            JOIN ORDERS o ON o.ORDER_ID = d.ORDER_ID
            JOIN COOKING_TASKS t ON t.ORDER_DETAIL_ID = d.ORDER_DETAIL_ID
            WHERE d.ORDER_DETAIL_ID = ? AND d.MENU_ID IN (2402, 2404) AND d.QUANTITY > 0
              AND o.ORDER_STATUS NOT IN ('CANCELED', 'CLOSED')
              AND (o.ORDER_METHOD IS NULL OR o.ORDER_METHOD NOT LIKE 'KDS_COMPARE%')
              AND t.STATUS IN ('KITCHEN_READY', 'FLOOR_PICKED')
            """, Integer.class, detailId);
        return count != null && count > 0;
    }

    public boolean hasUsage(Long detailId) {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM CHICKEN_STOCK_USAGE WHERE ORDER_DETAIL_ID = ?", Integer.class, detailId);
        return count != null && count > 0;
    }

    public Long firstUsableBatch(LocalDateTime now) {
        List<Long> ids = jdbcTemplate.query("""
            SELECT BATCH_ID FROM CHICKEN_PREP_BATCHES
            WHERE STATUS = 'READY' AND REMAINING_QTY > 0 AND EXPIRES_AT > ?
            ORDER BY EXPIRES_AT, BATCH_ID FOR UPDATE
            """, (rs, rowNum) -> rs.getLong("BATCH_ID"), Timestamp.valueOf(now));
        return ids.isEmpty() ? null : ids.get(0);
    }

    public void consume(Long batchId, LocalDateTime now) {
        int updated = jdbcTemplate.update("""
            UPDATE CHICKEN_PREP_BATCHES SET REMAINING_QTY = REMAINING_QTY - 1
            WHERE BATCH_ID = ? AND STATUS = 'READY' AND REMAINING_QTY > 0 AND EXPIRES_AT > ?
            """, batchId, Timestamp.valueOf(now));
        if (updated != 1) throw new IllegalStateException("Chicken stock changed before allocation");
    }

    public void recordUsage(Long detailId, Long batchId, LocalDateTime now) {
        jdbcTemplate.update("""
            INSERT INTO CHICKEN_STOCK_USAGE (ORDER_DETAIL_ID, BATCH_ID, USED_AT)
            VALUES (?, ?, ?)
            """, detailId, batchId, Timestamp.valueOf(now));
    }

    public List<Batch> visibleBatches(LocalDateTime now) {
        return jdbcTemplate.query("""
            SELECT BATCH_ID, REQUESTED_QTY, REMAINING_QTY, WASTED_QTY, STATUS, SOURCE,
                   REQUESTED_AT, STARTED_AT, READY_AT, EXPIRES_AT
            FROM CHICKEN_PREP_BATCHES
            WHERE STATUS IN ('REQUESTED', 'COOKING', 'READY')
               OR (STATUS = 'EXPIRED' AND WASTED_QTY > 0 AND EXPIRES_AT >= ?)
               OR (STATUS = 'LAPSED' AND REQUESTED_AT >= ?)
            ORDER BY REQUESTED_AT DESC, BATCH_ID DESC
            """, (rs, rowNum) -> new Batch(
                rs.getLong("BATCH_ID"), rs.getInt("REQUESTED_QTY"), rs.getInt("REMAINING_QTY"),
                rs.getInt("WASTED_QTY"), rs.getString("STATUS"), rs.getString("SOURCE"),
                rs.getObject("REQUESTED_AT", LocalDateTime.class),
                rs.getObject("STARTED_AT", LocalDateTime.class),
                rs.getObject("READY_AT", LocalDateTime.class),
                rs.getObject("EXPIRES_AT", LocalDateTime.class)
            ), Timestamp.valueOf(now.minusDays(1)), Timestamp.valueOf(now.minusDays(1)));
    }

    public int wastedToday(LocalDateTime now) {
        LocalDateTime start = now.toLocalDate().atStartOfDay();
        return jdbcTemplate.queryForObject("""
            SELECT NVL(SUM(WASTED_QTY), 0) FROM CHICKEN_PREP_BATCHES
            WHERE EXPIRES_AT >= ? AND EXPIRES_AT < ?
              AND STATUS IN ('EXPIRED', 'DISCARDED')
            """, Integer.class, Timestamp.valueOf(start), Timestamp.valueOf(start.plusDays(1)));
    }

    public int untrackedToday(LocalDateTime now) {
        LocalDateTime start = now.toLocalDate().atStartOfDay();
        return jdbcTemplate.queryForObject("""
            SELECT COUNT(*) FROM CHICKEN_STOCK_USAGE
            WHERE BATCH_ID IS NULL AND USED_AT >= ? AND USED_AT < ?
            """, Integer.class, Timestamp.valueOf(start), Timestamp.valueOf(start.plusDays(1)));
    }
}
