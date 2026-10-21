package jp.co.lossvoid.form;

import jakarta.validation.constraints.NotBlank;

public record StatusUpdateRequest(
    @NotBlank String status,
    Boolean served
) {
}
