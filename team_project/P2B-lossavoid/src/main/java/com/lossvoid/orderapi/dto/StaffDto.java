package com.lossvoid.orderapi.dto;

public record StaffDto(
    String code,
    String name,
    String role,
    Boolean enabled
) {
}
