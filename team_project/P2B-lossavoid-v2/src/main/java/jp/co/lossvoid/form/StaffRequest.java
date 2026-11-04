package jp.co.lossvoid.form;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 担当者登録・更新の入力値。コード・氏名・担当区分を検証し、認証情報は受け付けない。
 */
public record StaffRequest(
    @NotBlank
    @Pattern(regexp = "[A-Za-z0-9_-]{1,20}")
    String code,

    @NotBlank
    @Size(max = 80)
    String name,

    @NotBlank
    @Pattern(regexp = "SYSTEM_ADMIN|EMPLOYEE")
    String role,

    Boolean enabled
) {
}
