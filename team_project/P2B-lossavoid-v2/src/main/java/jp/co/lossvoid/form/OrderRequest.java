package jp.co.lossvoid.form;

import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

public record OrderRequest(
    @NotBlank String table,
    @Min(1) @Max(99) Integer guestCount,
    String orderMethod,
    @Valid @NotEmpty List<OrderItemRequest> items
) {
}
