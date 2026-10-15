package com.lossvoid.orderapi.dto;

import java.util.List;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

public record MergeRequest(
    @NotEmpty List<Long> orderIds,
    @NotBlank String table,
    String orderMethod
) {
}
