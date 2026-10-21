package jp.co.lossvoid.form;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record StaffRequest(
    @NotBlank
    @Pattern(regexp = "[A-Za-z0-9_-]{1,20}")
    String code,

    @NotBlank
    @Size(max = 80)
    String name,

    @Size(max = 100)
    String password,

    @NotBlank
    @Pattern(regexp = "SYSTEM_ADMIN|EMPLOYEE")
    String role,

    Boolean enabled
) {
}
