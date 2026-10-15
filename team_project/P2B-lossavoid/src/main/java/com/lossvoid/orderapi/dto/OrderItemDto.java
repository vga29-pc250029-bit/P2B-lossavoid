package com.lossvoid.orderapi.dto;

import java.time.LocalDateTime;

public record OrderItemDto(
    Long id,
    String code,
    String name,
    Integer price,
    Integer qty,
    String cookStatus,
    Boolean served,
    LocalDateTime servedAt,
    String note
) {
}
