package jp.co.lossvoid.form;

import java.util.List;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

public record MergeRequest(
    @NotEmpty List<Long> orderIds,
    @NotBlank String table,
    String orderMethod
) {
}
