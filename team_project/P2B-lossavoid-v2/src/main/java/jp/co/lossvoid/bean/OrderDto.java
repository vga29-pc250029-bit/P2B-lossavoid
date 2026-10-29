package jp.co.lossvoid.bean;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 注文ヘッダーと明細をまとめたAPIの応答。卓番・人数は紐づく来店情報から取得する。
 */
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
