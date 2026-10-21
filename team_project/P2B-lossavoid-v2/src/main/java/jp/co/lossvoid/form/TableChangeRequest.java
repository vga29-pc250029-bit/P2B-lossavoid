package jp.co.lossvoid.form;

import jakarta.validation.constraints.NotBlank;

public record TableChangeRequest(
    @NotBlank String table
) {
}
