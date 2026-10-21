package jp.co.lossvoid.bean;

import java.util.List;

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
