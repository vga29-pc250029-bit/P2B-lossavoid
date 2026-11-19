package jp.co.lossvoid.form;

import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

/**
 * 卓番・人数・注文方法と商品一覧を受け取る。人数が指定された場合は1〜99名、明細は空でないことを検証する。
 */
public record OrderRequest(
    @NotBlank String table,
    @Min(1) @Max(99) Integer guestCount,
    String orderMethod,
    @Valid @NotEmpty List<OrderItemRequest> items
) {
}
