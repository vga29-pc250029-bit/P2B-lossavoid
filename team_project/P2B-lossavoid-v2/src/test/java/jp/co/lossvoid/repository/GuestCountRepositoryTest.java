package jp.co.lossvoid.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import jp.co.lossvoid.bean.OrderDto;
import jp.co.lossvoid.form.OrderRequest;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/**
 * DBをモック化し、来店人数の保存と、追加注文で既存の来店情報を再利用することを確認する。
 */
class GuestCountRepositoryTest {
    @Test
    void storesPeopleInCustomersAndLinksTheNativeOrderId() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("SEQ_CUSTOMERS.NEXTVAL"), eq(Long.class))).thenReturn(7L);
        when(jdbc.queryForObject(contains("SEQ_ORDERS.NEXTVAL"), eq(Long.class))).thenReturn(42L);
        OrderRepository repository = spy(new OrderRepository(jdbc));
        OrderDto saved = new OrderDto(42L, "03-0", 4, "WAITING", "SELF", LocalDateTime.now(), List.of());
        doReturn(saved).when(repository).findById(42L);

        assertEquals(saved, repository.create(new OrderRequest("03-0", 4, "SELF", List.of())));
        verify(jdbc).update(contains("INSERT INTO CUSTOMERS"), eq(7L), eq("03-0"), eq(4));
        verify(jdbc).update(contains("INSERT INTO ORDERS"), eq(42L), eq(7L), eq("SELF"));
    }

    @Test
    void additionalOrdersReuseTheOpenCustomerVisit() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(contains("SELECT CUSTOMER_ID"), org.mockito.ArgumentMatchers.<RowMapper<Long>>any(), eq("03-0")))
            .thenReturn(List.of(7L));
        when(jdbc.queryForObject(contains("SEQ_ORDERS.NEXTVAL"), eq(Long.class))).thenReturn(42L);
        OrderRepository repository = spy(new OrderRepository(jdbc));
        doReturn(null).when(repository).findById(42L);

        repository.create(new OrderRequest("03-0", 4, "SELF", List.of()));
        verify(jdbc).update(contains("UPDATE CUSTOMERS SET NUMBER_OF_PEOPLE"), eq(4), eq(7L));
        verify(jdbc, never()).queryForObject(contains("SEQ_CUSTOMERS.NEXTVAL"), eq(Long.class));
    }
}
