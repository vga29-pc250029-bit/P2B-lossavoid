package com.lossvoid.orderapi.dto;

import jakarta.validation.constraints.NotBlank;

public record StatusUpdateRequest(
    @NotBlank String status,
    Boolean served
) {
}
