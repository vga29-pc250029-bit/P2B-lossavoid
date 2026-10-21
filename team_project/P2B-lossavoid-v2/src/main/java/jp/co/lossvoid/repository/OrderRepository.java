package jp.co.lossvoid.repository;

import jp.co.lossvoid.form.MergeRequest;
import jp.co.lossvoid.bean.OrderDto;
import jp.co.lossvoid.bean.OrderItemDto;
import jp.co.lossvoid.form.OrderItemRequest;
import jp.co.lossvoid.form.OrderRequest;
import jp.co.lossvoid.form.StatusUpdateRequest;
import jp.co.lossvoid.form.TableChangeRequest;
import java.sql.PreparedStatement;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class OrderRepository {
    private final JdbcTemplate jdbcTemplate;

    public OrderRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public OrderDto create(OrderRequest request) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                INSERT INTO ORDERS (TABLE_NO, GUEST_COUNT, STATUS, ORDER_METHOD)
                VALUES (?, ?, 'WAITING', ?)
                """, new String[] { "ORDER_ID" });
            ps.setString(1, request.table());
            if (request.guestCount() == null) ps.setNull(2, java.sql.Types.INTEGER);
            else ps.setInt(2, request.guestCount());
            ps.setString(3, request.orderMethod());
            return ps;
        }, keyHolder);

        Long orderId = keyHolder.getKey().longValue();
        for (OrderItemRequest item : request.items()) {
            for (int unit = 0; unit < item.qty(); unit++) {
                jdbcTemplate.update("""
                    INSERT INTO ORDER_ITEMS (ORDER_ID, MENU_CODE, MENU_NAME, PRICE, QTY, NOTE)
                    VALUES (?, ?, ?, ?, 1, ?)
                    """, orderId, item.code(), item.name(), item.price(), item.note());
            }
        }
        return findById(orderId);
    }

    public List<OrderDto> findByTable(String tableNo) {
        return jdbcTemplate.query("""
            SELECT ORDER_ID, TABLE_NO, GUEST_COUNT, STATUS, ORDER_METHOD, CREATED_AT
            FROM ORDERS
            WHERE TABLE_NO = ? AND STATUS <> 'CANCELED'
            ORDER BY CREATED_AT DESC
            """, (rs, rowNum) -> toOrderDto(
                rs.getLong("ORDER_ID"),
                rs.getString("TABLE_NO"),
                rs.getObject("GUEST_COUNT", Integer.class),
                rs.getString("STATUS"),
                rs.getString("ORDER_METHOD"),
                rs.getObject("CREATED_AT", LocalDateTime.class)
            ), tableNo);
    }

    public List<OrderDto> findKitchenOrders() {
        return jdbcTemplate.query("""
            SELECT ORDER_ID, TABLE_NO, GUEST_COUNT, STATUS, ORDER_METHOD, CREATED_AT
            FROM ORDERS
            WHERE STATUS NOT IN ('CLOSED', 'CANCELED')
            ORDER BY CREATED_AT
            """, (rs, rowNum) -> toOrderDto(
                rs.getLong("ORDER_ID"),
                rs.getString("TABLE_NO"),
                rs.getObject("GUEST_COUNT", Integer.class),
                rs.getString("STATUS"),
                rs.getString("ORDER_METHOD"),
                rs.getObject("CREATED_AT", LocalDateTime.class)
            ));
    }

    public OrderDto findById(Long orderId) {
        return jdbcTemplate.queryForObject("""
            SELECT ORDER_ID, TABLE_NO, GUEST_COUNT, STATUS, ORDER_METHOD, CREATED_AT
            FROM ORDERS
            WHERE ORDER_ID = ?
            """, (rs, rowNum) -> toOrderDto(
                rs.getLong("ORDER_ID"),
                rs.getString("TABLE_NO"),
                rs.getObject("GUEST_COUNT", Integer.class),
                rs.getString("STATUS"),
                rs.getString("ORDER_METHOD"),
                rs.getObject("CREATED_AT", LocalDateTime.class)
            ), orderId);
    }

    public void changeTable(Long orderId, TableChangeRequest request) {
        jdbcTemplate.update("""
            UPDATE ORDERS
            SET TABLE_NO = ?, UPDATED_AT = CURRENT_TIMESTAMP
            WHERE ORDER_ID = ?
            """, request.table(), orderId);
    }

    public void updateItemStatus(Long orderItemId, StatusUpdateRequest request) {
        Integer served = request.served() == null ? null : request.served() ? 1 : 0;
        jdbcTemplate.update("""
            UPDATE ORDER_ITEMS
            SET COOK_STATUS = ?,
                SERVED = COALESCE(?, SERVED),
                SERVED_AT = CASE
                    WHEN ? = 1 THEN CURRENT_TIMESTAMP
                    WHEN ? = 0 THEN NULL
                    ELSE SERVED_AT
                END
            WHERE ORDER_ITEM_ID = ?
            """, request.status(), served, served, served, orderItemId);
    }

    public void cancelOrder(Long orderId) {
        jdbcTemplate.update("UPDATE ORDERS SET STATUS = 'CANCELED', UPDATED_AT = CURRENT_TIMESTAMP WHERE ORDER_ID = ?", orderId);
    }

    @Transactional
    public void cancelOneItem(Long orderId, Long orderItemId) {
        Integer quantity = jdbcTemplate.queryForObject("""
            SELECT QTY
            FROM ORDER_ITEMS
            WHERE ORDER_ID = ? AND ORDER_ITEM_ID = ? AND COOK_STATUS <> 'CANCELED'
            FOR UPDATE
            """, Integer.class, orderId, orderItemId);

        if (quantity == null || quantity < 1) {
            throw new IllegalStateException("The order item has already been canceled");
        }

        if (quantity > 1) {
            jdbcTemplate.update("""
                UPDATE ORDER_ITEMS
                SET QTY = QTY - 1
                WHERE ORDER_ID = ? AND ORDER_ITEM_ID = ?
                """, orderId, orderItemId);
        } else {
            jdbcTemplate.update("""
                UPDATE ORDER_ITEMS
                SET QTY = 0, COOK_STATUS = 'CANCELED', SERVED = 0, SERVED_AT = NULL
                WHERE ORDER_ID = ? AND ORDER_ITEM_ID = ?
                """, orderId, orderItemId);
        }

        jdbcTemplate.update("""
            UPDATE ORDERS
            SET STATUS = CASE
                    WHEN EXISTS (
                        SELECT 1 FROM ORDER_ITEMS
                        WHERE ORDER_ID = ? AND QTY > 0 AND COOK_STATUS <> 'CANCELED'
                    ) THEN STATUS
                    ELSE 'CANCELED'
                END,
                UPDATED_AT = CURRENT_TIMESTAMP
            WHERE ORDER_ID = ?
            """, orderId, orderId);
    }

    @Transactional
    public OrderDto merge(MergeRequest request) {
        List<OrderDto> orders = request.orderIds().stream().map(this::findById).toList();
        List<OrderItemRequest> mergedItems = orders.stream()
            .flatMap(order -> order.items().stream())
            .map(item -> new OrderItemRequest(item.code(), item.name(), item.price(), item.qty(), item.note()))
            .toList();
        OrderDto merged = create(new OrderRequest(request.table(), null, request.orderMethod(), mergedItems));
        request.orderIds().forEach(this::cancelOrder);
        return merged;
    }

    private OrderDto toOrderDto(Long id, String table, Integer guestCount, String status, String orderMethod, LocalDateTime createdAt) {
        return new OrderDto(id, table, guestCount, status, orderMethod, createdAt, findItems(id));
    }

    private List<OrderItemDto> findItems(Long orderId) {
        return jdbcTemplate.query("""
            SELECT ORDER_ITEM_ID, MENU_CODE, MENU_NAME, PRICE, QTY, COOK_STATUS, SERVED, SERVED_AT, NOTE
            FROM ORDER_ITEMS
            WHERE ORDER_ID = ? AND QTY > 0 AND COOK_STATUS <> 'CANCELED'
            ORDER BY ORDER_ITEM_ID
            """, (rs, rowNum) -> new OrderItemDto(
                rs.getLong("ORDER_ITEM_ID"),
                rs.getString("MENU_CODE"),
                rs.getString("MENU_NAME"),
                rs.getInt("PRICE"),
                rs.getInt("QTY"),
                rs.getString("COOK_STATUS"),
                rs.getInt("SERVED") == 1,
                rs.getObject("SERVED_AT", LocalDateTime.class),
                rs.getString("NOTE")
            ), orderId);
    }
}
