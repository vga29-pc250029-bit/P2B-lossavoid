package jp.co.lossvoid.repository;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jp.co.lossvoid.form.StatusUpdateRequest;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * DBをモック化し、完成後の巻き戻し拒否、持出し前の状態確認、繰り返し更新の扱いを検証する。
 */
class OrderStatusTransitionRepositoryTest {
    @Test
    void rejectsRewindAfterKitchenReadyWithoutChangingOrderDetails() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        OrderRepository repository = new OrderRepository(jdbc);

        IllegalStateException exception = assertThrows(IllegalStateException.class,
            () -> repository.updateItemStatus(7L, new StatusUpdateRequest("WAITING", false)));

        verify(jdbc).update(contains("AND STATUS IN ('WAITING', 'COOKING')"),
            eq("WAITING"), eq("WAITING"), eq("WAITING"), eq("WAITING"), eq(7L));
        verify(jdbc, never()).update(contains("UPDATE ORDER_DETAILS"),
            eq(0), eq(0), eq("WAITING"), eq(7L));
        org.junit.jupiter.api.Assertions.assertTrue(exception.getMessage().contains("WAITING"));
    }

    @Test
    void permitsOnlyPreReadyWaitingAndCookingTransitionsAndUpdatesDetailsAfterward() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(contains("AND STATUS IN ('WAITING', 'COOKING')"),
            eq("COOKING"), eq("COOKING"), eq("COOKING"), eq("COOKING"), eq(7L)))
            .thenReturn(1);
        OrderRepository repository = new OrderRepository(jdbc);

        assertDoesNotThrow(() -> repository.updateItemStatus(
            7L, new StatusUpdateRequest("cooking", false)));

        InOrder updates = inOrder(jdbc);
        updates.verify(jdbc).update(contains("UPDATE COOKING_TASKS"),
            eq("COOKING"), eq("COOKING"), eq("COOKING"), eq("COOKING"), eq(7L));
        updates.verify(jdbc).update(contains("UPDATE ORDER_DETAILS"),
            eq(0), eq(0), eq("COOKING"), eq(7L));
    }

    @Test
    void keepsReadyPickupAndLegacyUpdatesIdempotent() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(contains("SET STATUS = 'KITCHEN_READY'"), eq(7L))).thenReturn(1);
        when(jdbc.update(contains("SET STATUS = 'FLOOR_PICKED'"), eq(7L))).thenReturn(1);
        OrderRepository repository = new OrderRepository(jdbc);

        assertDoesNotThrow(() -> repository.updateItemStatus(
            7L, new StatusUpdateRequest("KITCHEN_READY", null)));
        assertDoesNotThrow(() -> repository.updateItemStatus(
            7L, new StatusUpdateRequest("KITCHEN_READY", null)));
        assertDoesNotThrow(() -> repository.updateItemStatus(
            7L, new StatusUpdateRequest("FLOOR_PICKED", true)));
        assertDoesNotThrow(() -> repository.updateItemStatus(
            7L, new StatusUpdateRequest("FLOOR_PICKED", true)));
        assertDoesNotThrow(() -> repository.updateItemStatus(
            7L, new StatusUpdateRequest("COMPLETED", true)));
        assertDoesNotThrow(() -> repository.updateItemStatus(
            7L, new StatusUpdateRequest("DONE", true)));

        verify(jdbc, org.mockito.Mockito.times(2))
            .update(contains("SET STATUS = 'KITCHEN_READY'"), eq(7L));
        verify(jdbc, org.mockito.Mockito.times(4))
            .update(contains("SET STATUS = 'FLOOR_PICKED'"), eq(7L));
    }
}
