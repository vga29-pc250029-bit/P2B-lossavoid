package com.lossvoid.orderapi.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.lossvoid.orderapi.dto.OrderDto;
import com.lossvoid.orderapi.repository.MenuRepository;
import com.lossvoid.orderapi.service.OrderService;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(OrderApiController.class)
@AutoConfigureMockMvc(addFilters = false)
class GuestCountControllerTest {
    @Autowired
    private MockMvc mvc;

    @MockBean
    private OrderService orderService;

    @MockBean
    private MenuRepository menuRepository;

    @ParameterizedTest
    @ValueSource(ints = { 1, 2, 99 })
    void acceptsAndForwardsGuestCount(int count) throws Exception {
        when(orderService.createOrder(any())).thenReturn(
            new OrderDto(1L, "01-1", count, "WAITING", "SELF", LocalDateTime.now(), List.of())
        );
        mvc.perform(post("/api/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody(String.valueOf(count))))
            .andExpect(status().isOk());
        verify(orderService).createOrder(argThat(request ->
            request.guestCount() == count && request.table().equals("01-1")
        ));
    }

    @ParameterizedTest
    @ValueSource(strings = { "0", "-1", "100", "1.5", "\"invalid\"" })
    void rejectsInvalidCountsBeforeAccessingTheDatabase(String count) throws Exception {
        mvc.perform(post("/api/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody(count)))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(orderService);
    }

    private String requestBody(String count) {
        return """
            {
              "table": "01-1",
              "guestCount": %s,
              "orderMethod": "SELF",
              "items": [{"code":"2201","name":"Test pizza","price":500,"qty":1}]
            }
            """.formatted(count);
    }
}
