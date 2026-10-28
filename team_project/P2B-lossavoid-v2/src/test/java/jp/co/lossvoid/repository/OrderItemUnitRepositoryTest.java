package jp.co.lossvoid.repository;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import jp.co.lossvoid.bean.OrderDto;
import jp.co.lossvoid.form.OrderItemRequest;
import jp.co.lossvoid.form.OrderRequest;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class OrderItemUnitRepositoryTest {
    @Test
    void storesEveryUnitAsADetailAndCookingTask() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("SEQ_CUSTOMERS.NEXTVAL"), eq(Long.class))).thenReturn(7L);
        when(jdbc.queryForObject(contains("SEQ_ORDERS.NEXTVAL"), eq(Long.class))).thenReturn(42L);
        when(jdbc.queryForObject(contains("SEQ_ORDER_DETAILS.NEXTVAL"), eq(Long.class))).thenReturn(101L, 102L, 103L);
        OrderRepository repository = spy(new OrderRepository(jdbc));
        doReturn(new OrderDto(42L, "01", 2, "WAITING", "SELF", LocalDateTime.now(), List.of()))
            .when(repository).findById(42L);

        repository.create(new OrderRequest("01", 2, "SELF", List.of(new OrderItemRequest("2101", "Doria", 300, 3, null))));

        verify(jdbc, times(3)).update(contains("INSERT INTO ORDER_DETAILS"),
            anyLong(), eq(42L), eq(2101L), eq("Doria"), eq(300), isNull());
        for (Long detailId : List.of(101L, 102L, 103L)) {
            verify(jdbc).update(contains("INSERT INTO COOKING_TASKS"), eq(detailId));
        }
    }

    @Test
    void cancelsAServedUnitAndItsCookingTask() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("SELECT d.QUANTITY"), eq(Integer.class), eq(42L), eq(7L))).thenReturn(1);

        new OrderRepository(jdbc).cancelOneItem(42L, 7L);

        verify(jdbc).update(contains("SET QUANTITY = 0, SERVED = 0"), eq(42L), eq(7L));
        verify(jdbc).update(contains("UPDATE COOKING_TASKS SET STATUS = 'CANCELED'"), eq(7L));
        verify(jdbc).update(contains("UPDATE ORDERS"), eq(42L), eq(42L));
    }
}
