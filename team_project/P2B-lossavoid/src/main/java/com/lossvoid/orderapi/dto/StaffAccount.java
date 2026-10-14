package com.lossvoid.orderapi.dto;

public record StaffAccount(
    String code,
    String name,
    String passwordHash,
    String role,
    Boolean enabled
) {
}
