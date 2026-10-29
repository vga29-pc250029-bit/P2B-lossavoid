package jp.co.lossvoid.bean;

/**
 * 管理画面へ返す従業員情報。認証用のパスワードハッシュは含めない。
 */
public record StaffDto(
    String code,
    String name,
    String role,
    Boolean enabled
) {
}
