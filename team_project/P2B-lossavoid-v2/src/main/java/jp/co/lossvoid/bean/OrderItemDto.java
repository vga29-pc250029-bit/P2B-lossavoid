package jp.co.lossvoid.bean;

import java.time.LocalDateTime;

public record OrderItemDto(
    Long id,
    String code,
    String name,
    Integer price,
    Integer qty,
    String cookStatus,
    LocalDateTime kitchenReadyAt,
    Boolean served,
    LocalDateTime servedAt,
    String note
) {
}
