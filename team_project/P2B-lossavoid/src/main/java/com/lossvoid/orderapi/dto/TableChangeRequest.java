package com.lossvoid.orderapi.dto;

import jakarta.validation.constraints.NotBlank;

public record TableChangeRequest(
    @NotBlank String table
) {
}
