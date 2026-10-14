package com.lossvoid.orderapi.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.lossvoid.orderapi.dto.OrderDto;
import com.lossvoid.orderapi.dto.OrderRequest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.KeyHolder;

class GuestCountRepositoryTest {
    @Test
    void bindsGuestCountAndRequestsTheOracleOrderIdColumn() throws Exception {
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
        OrderDto saved = new OrderDto(42L, "03-0", 4, "WAITING", "SELF", LocalDateTime.now(), List.of());
        doReturn(saved).when(repository).findById(42L);

        OrderDto result = repository.create(new OrderRequest("03-0", 4, "SELF", List.of()));

        verify(connection).prepareStatement(anyString(), aryEq(new String[] { "ORDER_ID" }));
        verify(statement).setString(1, "03-0");
        verify(statement).setInt(2, 4);
        verify(statement).setString(3, "SELF");
        assertEquals(4, result.guestCount());
        verify(repository).findById(eq(42L));
    }
}
