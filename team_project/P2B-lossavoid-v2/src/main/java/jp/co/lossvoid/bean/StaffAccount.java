package jp.co.lossvoid.bean;

public record StaffAccount(
    String code,
    String name,
    String passwordHash,
    String role,
    Boolean enabled
) {
}
