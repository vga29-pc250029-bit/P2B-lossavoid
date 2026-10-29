package jp.co.lossvoid.form;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * 注文する商品の入力値。Oracleの番号・価格の範囲と、1以上の個数をリクエスト検証で確認する。
 */
public record OrderItemRequest(
    @NotBlank @Pattern(regexp = "[0-9]{1,10}") String code,
    @NotBlank String name,
    @Min(0) @Max(99999999) int price,
    @Min(1) int qty,
    String note
) {
}
