package com.lossvoid.orderapi.controller;

import com.lossvoid.orderapi.BasicLogoutBarrierFilter;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    @GetMapping("/me")
    public Map<String, String> currentUser(Authentication authentication) {
        boolean administrator = authentication.getAuthorities().stream()
            .anyMatch(authority -> "ROLE_SYSTEM_ADMIN".equals(authority.getAuthority()));
        return Map.of(
            "username", authentication.getName(),
            "role", administrator ? "SYSTEM_ADMIN" : "EMPLOYEE"
        );
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response) {
        response.addHeader(
            HttpHeaders.SET_COOKIE,
            BasicLogoutBarrierFilter.COOKIE_NAME + "=1; Max-Age=120; Path=/; HttpOnly; SameSite=Strict"
        );
        return ResponseEntity.noContent()
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .build();
    }
}
