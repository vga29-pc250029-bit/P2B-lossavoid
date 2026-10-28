package jp.co.lossvoid.repository;

import jp.co.lossvoid.form.MergeRequest;
import jp.co.lossvoid.bean.OrderDto;
import jp.co.lossvoid.bean.OrderItemDto;
import jp.co.lossvoid.form.OrderItemRequest;
import jp.co.lossvoid.form.OrderRequest;
import jp.co.lossvoid.form.StatusUpdateRequest;
import jp.co.lossvoid.form.TableChangeRequest;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class OrderRepository {
    private static final String ORDER_SELECT = """
        SELECT o.ORDER_ID, c.TABLE_NO, c.NUMBER_OF_PEOPLE AS GUEST_COUNT,
               o.ORDER_STATUS AS STATUS, o.ORDER_METHOD, o.ORDER_TIME AS CREATED_AT
        FROM ORDERS o JOIN CUSTOMERS c ON c.CUSTOMER_ID = o.CUSTOMER_ID
        """;
    private final JdbcTemplate jdbcTemplate;

    public OrderRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public OrderDto create(OrderRequest request) {
        Long customerId = resolveCustomer(request.table(), request.guestCount());
        Long orderId = jdbcTemplate.queryForObject("SELECT SEQ_ORDERS.NEXTVAL FROM DUAL", Long.class);
        jdbcTemplate.update("""
            INSERT INTO ORDERS (ORDER_ID, CUSTOMER_ID, ORDER_STATUS, ORDER_TIME, ORDER_METHOD, UPDATED_AT)
            VALUES (?, ?, 'WAITING', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
            """, orderId, customerId, request.orderMethod());

        for (OrderItemRequest item : request.items()) {
            for (int unit = 0; unit < item.qty(); unit++) {
                Long detailId = jdbcTemplate.queryForObject("SELECT SEQ_ORDER_DETAILS.NEXTVAL FROM DUAL", Long.class);
                jdbcTemplate.update("""
                    INSERT INTO ORDER_DETAILS (ORDER_DETAIL_ID, ORDER_ID, MENU_ID, MENU_NAME, PRICE, QUANTITY, NOTE)
                    VALUES (?, ?, ?, ?, ?, 1, ?)
                    """, detailId, orderId, Long.parseLong(item.code()), item.name(), item.price(), item.note());
                jdbcTemplate.update("""
                    INSERT INTO COOKING_TASKS (TASK_ID, ORDER_DETAIL_ID, STATUS, PRIORITY_ORDER)
                    VALUES (SEQ_COOKING_TASKS.NEXTVAL, ?, 'WAITING', 1)
                    """, detailId);
            }
        }
        return findById(orderId);
    }

    public List<OrderDto> findByTable(String tableNo) {
        return jdbcTemplate.query(ORDER_SELECT + """
            WHERE c.TABLE_NO = ? AND o.ORDER_STATUS <> 'CANCELED'
            ORDER BY o.ORDER_TIME DESC, o.ORDER_ID DESC
            """, orderMapper(), tableNo);
    }

    public List<OrderDto> findKitchenOrders() {
        return jdbcTemplate.query(ORDER_SELECT + """
            WHERE o.ORDER_STATUS NOT IN ('CLOSED', 'CANCELED')
            ORDER BY o.ORDER_TIME, o.ORDER_ID
            """, orderMapper());
    }

    public OrderDto findById(Long orderId) {
        return jdbcTemplate.queryForObject(ORDER_SELECT + "WHERE o.ORDER_ID = ?", orderMapper(), orderId);
    }

    @Transactional
    public void changeTable(Long orderId, TableChangeRequest request) {
        OrderDto order = findById(orderId);
        Long customerId = resolveCustomer(request.table(), order.guestCount());
        jdbcTemplate.update("""
            UPDATE ORDERS SET CUSTOMER_ID = ?, UPDATED_AT = CURRENT_TIMESTAMP WHERE ORDER_ID = ?
            """, customerId, orderId);
    }

    @Transactional
    public void updateItemStatus(Long orderItemId, StatusUpdateRequest request) {
        Integer served = request.served() == null ? null : request.served() ? 1 : 0;
        jdbcTemplate.update("""
            UPDATE ORDER_DETAILS
            SET SERVED = COALESCE(?, SERVED),
                SERVED_AT = CASE
                    WHEN ? = 1 THEN CURRENT_TIMESTAMP
                    WHEN ? = 0 THEN NULL
                    ELSE SERVED_AT
                END
            WHERE ORDER_DETAIL_ID = ?
            """, served, served, served, orderItemId);
        jdbcTemplate.update("""
            UPDATE COOKING_TASKS
            SET STATUS = ?,
                START_TIME = CASE WHEN ? = 'COOKING' THEN COALESCE(START_TIME, CURRENT_TIMESTAMP) ELSE START_TIME END,
                END_TIME = CASE WHEN ? IN ('COMPLETED', 'DONE') THEN COALESCE(END_TIME, CURRENT_TIMESTAMP)
                                WHEN ? = 'WAITING' THEN NULL ELSE END_TIME END
            WHERE ORDER_DETAIL_ID = ?
            """, request.status(), request.status(), request.status(), request.status(), orderItemId);
    }

    public void cancelOrder(Long orderId) {
        jdbcTemplate.update("""
            UPDATE ORDERS SET ORDER_STATUS = 'CANCELED', UPDATED_AT = CURRENT_TIMESTAMP WHERE ORDER_ID = ?
            """, orderId);
    }

    @Transactional
    public void cancelOneItem(Long orderId, Long orderItemId) {
        Integer quantity = jdbcTemplate.queryForObject("""
            SELECT d.QUANTITY FROM ORDER_DETAILS d
            WHERE d.ORDER_ID = ? AND d.ORDER_DETAIL_ID = ? AND d.QUANTITY > 0
            FOR UPDATE
            """, Integer.class, orderId, orderItemId);
        if (quantity == null || quantity < 1) {
            throw new IllegalStateException("The order item has already been canceled");
        }
        if (quantity > 1) {
            jdbcTemplate.update("""
                UPDATE ORDER_DETAILS SET QUANTITY = QUANTITY - 1
                WHERE ORDER_ID = ? AND ORDER_DETAIL_ID = ?
                """, orderId, orderItemId);
        } else {
            jdbcTemplate.update("""
                UPDATE ORDER_DETAILS SET QUANTITY = 0, SERVED = 0, SERVED_AT = NULL
                WHERE ORDER_ID = ? AND ORDER_DETAIL_ID = ?
                """, orderId, orderItemId);
            jdbcTemplate.update("""
                UPDATE COOKING_TASKS SET STATUS = 'CANCELED' WHERE ORDER_DETAIL_ID = ?
                """, orderItemId);
        }
        jdbcTemplate.update("""
            UPDATE ORDERS
            SET ORDER_STATUS = CASE WHEN EXISTS (
                    SELECT 1 FROM ORDER_DETAILS WHERE ORDER_ID = ? AND QUANTITY > 0
                ) THEN ORDER_STATUS ELSE 'CANCELED' END,
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
        Integer guests = orders.stream().map(OrderDto::guestCount).filter(java.util.Objects::nonNull).findFirst().orElse(1);
        OrderDto merged = create(new OrderRequest(request.table(), guests, request.orderMethod(), mergedItems));
        request.orderIds().forEach(this::cancelOrder);
        return merged;
    }

    private Long resolveCustomer(String tableNo, Integer guestCount) {
        List<Long> customers = jdbcTemplate.query("""
            SELECT CUSTOMER_ID FROM CUSTOMERS
            WHERE TABLE_NO = ? AND STATUS = 'OPEN'
            ORDER BY VISIT_TIME DESC, CUSTOMER_ID DESC
            """, (rs, rowNum) -> rs.getLong("CUSTOMER_ID"), tableNo);
        if (!customers.isEmpty()) {
            Long customerId = customers.get(0);
            if (guestCount != null) {
                jdbcTemplate.update("UPDATE CUSTOMERS SET NUMBER_OF_PEOPLE = ? WHERE CUSTOMER_ID = ?", guestCount, customerId);
            }
            return customerId;
        }
        Long customerId = jdbcTemplate.queryForObject("SELECT SEQ_CUSTOMERS.NEXTVAL FROM DUAL", Long.class);
        jdbcTemplate.update("""
            INSERT INTO CUSTOMERS (CUSTOMER_ID, TABLE_NO, NUMBER_OF_PEOPLE, VISIT_TIME, STATUS)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'OPEN')
            """, customerId, tableNo, guestCount == null ? 1 : guestCount);
        return customerId;
    }

    private RowMapper<OrderDto> orderMapper() {
        return (rs, rowNum) -> new OrderDto(
            rs.getLong("ORDER_ID"), rs.getString("TABLE_NO"), rs.getObject("GUEST_COUNT", Integer.class),
            rs.getString("STATUS"), rs.getString("ORDER_METHOD"), rs.getObject("CREATED_AT", LocalDateTime.class),
            findItems(rs.getLong("ORDER_ID")));
    }

    private List<OrderItemDto> findItems(Long orderId) {
        return jdbcTemplate.query("""
            SELECT d.ORDER_DETAIL_ID AS ORDER_ITEM_ID, TO_CHAR(d.MENU_ID) AS MENU_CODE,
                   d.MENU_NAME, d.PRICE, d.QUANTITY AS QTY, COALESCE(t.STATUS, 'WAITING') AS COOK_STATUS,
                   d.SERVED, d.SERVED_AT, d.NOTE
            FROM ORDER_DETAILS d LEFT JOIN COOKING_TASKS t ON t.ORDER_DETAIL_ID = d.ORDER_DETAIL_ID
            WHERE d.ORDER_ID = ? AND d.QUANTITY > 0 AND COALESCE(t.STATUS, 'WAITING') <> 'CANCELED'
            ORDER BY d.ORDER_DETAIL_ID
            """, (rs, rowNum) -> new OrderItemDto(
                rs.getLong("ORDER_ITEM_ID"), rs.getString("MENU_CODE"), rs.getString("MENU_NAME"),
                rs.getInt("PRICE"), rs.getInt("QTY"), rs.getString("COOK_STATUS"), rs.getInt("SERVED") == 1,
                rs.getObject("SERVED_AT", LocalDateTime.class), rs.getString("NOTE")
            ), orderId);
    }
}
