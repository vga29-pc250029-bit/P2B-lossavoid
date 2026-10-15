package com.lossvoid.orderapi.dto;

import java.time.LocalDateTime;
import java.util.List;

public record OrderDto(
    Long id,
    String table,
    Integer guestCount,
    String status,
    String orderMethod,
    LocalDateTime createdAt,
    List<OrderItemDto> items
) {
}
