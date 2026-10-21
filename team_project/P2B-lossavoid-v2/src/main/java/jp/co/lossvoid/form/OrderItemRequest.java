package jp.co.lossvoid.form;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record OrderItemRequest(
    @NotBlank String code,
    @NotBlank String name,
    @Min(0) int price,
    @Min(1) int qty,
    String note
) {
}
