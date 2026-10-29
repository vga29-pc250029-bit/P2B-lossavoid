package jp.co.lossvoid.bean;

/**
 * 認証に必要な従業員情報。パスワードハッシュを含むため、一覧表示用のStaffDtoとは分けて扱う。
 */
public record StaffAccount(
    String code,
    String name,
    String passwordHash,
    String role,
    Boolean enabled
) {
}
