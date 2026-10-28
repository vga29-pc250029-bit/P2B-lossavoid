package jp.co.lossvoid;

import static org.junit.jupiter.api.Assertions.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import jp.co.lossvoid.bean.OrderDto;
import jp.co.lossvoid.bean.StaffDto;
import jp.co.lossvoid.form.*;
import jp.co.lossvoid.repository.*;
import jp.co.lossvoid.service.StaffService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.transaction.AfterTransaction;
import org.springframework.test.context.transaction.BeforeTransaction;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
@EnabledIfEnvironmentVariable(named = "LOSSAVOID_DB_TEST", matches = "true")
class LossavoidDatabaseIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired MenuRepository menus;
    @Autowired OrderRepository orders;
    @Autowired StaffRepository staff;
    @Autowired StaffService staffService;
    @Autowired PasswordEncoder encoder;
    private final Map<String, Integer> originalCounts = new LinkedHashMap<>();

    @BeforeTransaction
    void rememberTheOriginalDataCounts() {
        assertEquals("LOSSAVOID", jdbc.queryForObject("SELECT USER FROM DUAL", String.class));
        for (String table : List.of("MENUS", "CUSTOMERS", "ORDERS", "ORDER_DETAILS", "COOKING_TASKS", "STAFFS", "STORES")) {
            originalCounts.put(table, jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class));
        }
    }

    @AfterTransaction
    void testDataIsNeverCommitted() {
        originalCounts.forEach((table, count) ->
            assertEquals(count, jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class), table));
    }

    private void insertMenu() {
        jdbc.update("""
            INSERT INTO MENUS (MENU_ID, MENU_NAME, PRICE, CATEGORY, STANDARD_COOK_TIME, ALLERGY_INFO, PREP_STATION)
            VALUES (990001, 'Doria DB Test', 300, 'rice', 6, 'milk,egg', 'kitchen')
            """);
    }

    private OrderDto order(String table, int quantity) {
        return orders.create(new OrderRequest(table, 3, "SELF",
            List.of(new OrderItemRequest("990001", "Doria DB Test", 300, quantity, "test note"))));
    }

    @Test
    void readsNativeMenuTypesAndUpdatesStock() {
        insertMenu();
        menus.updateStock("990001", 7, true);
        var menu = menus.findAll().stream().filter(item -> item.code().equals("990001")).findFirst().orElseThrow();
        assertEquals(300, menu.price());
        assertEquals(6, menu.cookTime());
        assertEquals(7, menu.stockQty());
        assertTrue(menu.soldOut());
        assertEquals(List.of("milk", "egg"), menu.allergens());
    }

    @Test
    void createsAuthenticatesUpdatesAndDeletesNativeStaff() {
        StaffDto created = staffService.createStaff(new StaffRequest("DB_TEST", "DB Test", "test-password", "EMPLOYEE", true));
        var account = staff.findAccount("db_test").orElseThrow();
        assertEquals(created.code(), account.code());
        assertTrue(encoder.matches("test-password", account.passwordHash()));
        staffService.updateStaff("DB_TEST", new StaffRequest("DB_TEST", "Changed", "", "SYSTEM_ADMIN", false));
        var updated = staff.findAccount("DB_TEST").orElseThrow();
        assertEquals("SYSTEM_ADMIN", updated.role());
        assertFalse(updated.enabled());
        assertTrue(encoder.matches("test-password", updated.passwordHash()));
        staffService.deleteStaff("DB_TEST");
        assertTrue(staff.findAccount("DB_TEST").isEmpty());
    }

    @Test
    void savesUnitDetailsUpdatesCookingCancelsServedItemsAndMovesAndMergesTables() {
        insertMenu();
        OrderDto first = order("03-0", 2);
        OrderDto second = order("03-0", 1);
        assertEquals(2, first.items().size());
        assertTrue(first.items().stream().allMatch(item -> item.qty() == 1));
        assertEquals(3, first.guestCount());
        assertNotNull(first.createdAt());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM CUSTOMERS WHERE TABLE_NO = '03-0'", Integer.class));
        assertEquals(2, orders.findByTable("03-0").size());
        assertTrue(orders.findKitchenOrders().stream().anyMatch(item -> item.id().equals(first.id())));

        Long detail = first.items().get(0).id();
        orders.updateItemStatus(detail, new StatusUpdateRequest("COOKING", false));
        assertNotNull(jdbc.queryForObject("SELECT START_TIME FROM COOKING_TASKS WHERE ORDER_DETAIL_ID = ?", java.sql.Timestamp.class, detail));
        orders.updateItemStatus(detail, new StatusUpdateRequest("KITCHEN_READY", null));
        var ready = orders.findById(first.id()).items().get(0);
        assertFalse(ready.served());
        assertNull(ready.servedAt());
        assertNotNull(ready.kitchenReadyAt());
        assertEquals("KITCHEN_READY", ready.cookStatus());

        orders.updateItemStatus(detail, new StatusUpdateRequest("FLOOR_PICKED", true));
        var served = orders.findById(first.id()).items().get(0);
        assertTrue(served.served());
        assertNotNull(served.servedAt());
        assertNotNull(served.kitchenReadyAt());
        assertEquals(ready.kitchenReadyAt(), served.kitchenReadyAt());
        assertEquals("FLOOR_PICKED", served.cookStatus());
        assertNotNull(jdbc.queryForObject("SELECT END_TIME FROM COOKING_TASKS WHERE ORDER_DETAIL_ID = ?", java.sql.Timestamp.class, detail));

        // Repeated current-state events are harmless, but terminal items never move backward.
        orders.updateItemStatus(detail, new StatusUpdateRequest("FLOOR_PICKED", true));
        assertThrows(IllegalStateException.class,
            () -> orders.updateItemStatus(detail, new StatusUpdateRequest("COOKING", false)));
        assertThrows(IllegalStateException.class,
            () -> orders.updateItemStatus(detail, new StatusUpdateRequest("WAITING", false)));
        var stillServed = orders.findById(first.id()).items().get(0);
        assertEquals("FLOOR_PICKED", stillServed.cookStatus());
        assertEquals(served.kitchenReadyAt(), stillServed.kitchenReadyAt());
        assertEquals(served.servedAt(), stillServed.servedAt());

        Long legacyDetail = first.items().get(1).id();
        orders.updateItemStatus(legacyDetail, new StatusUpdateRequest("COMPLETED", true));
        orders.updateItemStatus(legacyDetail, new StatusUpdateRequest("DONE", true));
        assertEquals("FLOOR_PICKED", orders.findById(first.id()).items().get(1).cookStatus());

        orders.cancelOneItem(first.id(), detail);
        assertEquals(1, orders.findById(first.id()).items().size());
        assertEquals("CANCELED", jdbc.queryForObject("SELECT STATUS FROM COOKING_TASKS WHERE ORDER_DETAIL_ID = ?", String.class, detail));
        orders.changeTable(first.id(), new TableChangeRequest("04"));
        assertEquals("04", orders.findById(first.id()).table());
        assertEquals("03-0", orders.findById(second.id()).table());

        OrderDto merged = orders.merge(new MergeRequest(List.of(first.id(), second.id()), "05", "SELF"));
        assertEquals("05", merged.table());
        assertEquals(2, merged.items().size());
        assertEquals("CANCELED", orders.findById(first.id()).status());
        assertEquals("CANCELED", orders.findById(second.id()).status());
        for (var item : merged.items()) orders.cancelOneItem(merged.id(), item.id());
        assertEquals("CANCELED", orders.findById(merged.id()).status());
    }
}
