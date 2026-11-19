package jp.co.lossvoid.bean;

import java.time.LocalDateTime;

/**
 * 料理1個単位の明細と進行状況。キッチン完成時刻とフロア持出し時刻を区別して画面へ返す。
 */
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
