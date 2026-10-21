package jp.co.lossvoid.repository;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jp.co.lossvoid.bean.OrderDto;
import jp.co.lossvoid.form.OrderItemRequest;
import jp.co.lossvoid.form.OrderRequest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.KeyHolder;

class OrderItemUnitRepositoryTest {
    @Test
    void storesEveryOrderedQuantityAsAnIndividualRow() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        when(connection.prepareStatement(anyString(), any(String[].class))).thenReturn(statement);
        doAnswer(invocation -> {
            PreparedStatementCreator creator = invocation.getArgument(0);
            KeyHolder holder = invocation.getArgument(1);
            creator.createPreparedStatement(connection);
            holder.getKeyList().add(Map.of("ORDER_ID", 42L));
            return 1;
        }).when(jdbc).update(any(PreparedStatementCreator.class), any(KeyHolder.class));

        OrderRepository repository = spy(new OrderRepository(jdbc));
        OrderDto saved = new OrderDto(42L, "01", 2, "WAITING", "SELF", LocalDateTime.now(), List.of());
        doReturn(saved).when(repository).findById(42L);

        repository.create(new OrderRequest("01", 2, "SELF", List.of(
            new OrderItemRequest("2101", "ミラノ風ドリア", 300, 3, null)
        )));

        verify(jdbc, times(3)).update(
            contains("INSERT INTO ORDER_ITEMS"),
            eq(42L), eq("2101"), eq("ミラノ風ドリア"), eq(300), isNull()
        );
    }

    @Test
    void cancelsOneServedUnitWithoutRejectingItsServedState() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("SELECT QTY"), eq(Integer.class), eq(42L), eq(7L)))
            .thenReturn(1);
        OrderRepository repository = new OrderRepository(jdbc);

        repository.cancelOneItem(42L, 7L);

        verify(jdbc).update(
            contains("COOK_STATUS = 'CANCELED'"),
            eq(42L), eq(7L)
        );
        verify(jdbc).update(
            contains("UPDATE ORDERS"),
            eq(42L), eq(42L)
        );
    }
}
