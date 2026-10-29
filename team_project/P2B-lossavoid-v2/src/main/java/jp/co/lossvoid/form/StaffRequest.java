package jp.co.lossvoid.form;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 従業員登録・更新の入力値。コード形式・表示名・権限の検証と、パスワードの新規登録時の必須確認を分担する。
 */
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
