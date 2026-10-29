package jp.co.lossvoid.bean;

import java.util.List;

/**
 * メニュー一覧APIで返す商品情報。DBの値に、画面で使う画像URL・在庫・アレルゲン一覧を合わせる。
 */
public record MenuDto(
    String code,
    String name,
    Integer price,
    String category,
    String prepStation,
    Integer cookTime,
    String imageUrl,
    Integer stockQty,
    Boolean soldOut,
    List<String> allergens
) {
}
