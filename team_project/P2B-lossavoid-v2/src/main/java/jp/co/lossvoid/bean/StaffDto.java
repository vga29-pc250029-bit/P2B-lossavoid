package jp.co.lossvoid.bean;

public record StaffDto(
    String code,
    String name,
    String role,
    Boolean enabled
) {
}
