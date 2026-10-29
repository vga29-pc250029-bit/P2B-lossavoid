package jp.co.lossvoid.controller.staff;

import jp.co.lossvoid.bean.*;
import jp.co.lossvoid.form.*;
import jp.co.lossvoid.repository.*;
import jp.co.lossvoid.service.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

/**
 * 認証済み利用者のログイン案内と、ユーザー名・権限を返すAPI。パスワードの照合はSpring Securityが担当する。
 */
@Controller
public class LoginController {

    @GetMapping("/staff/login")
    public String login() { return "staff/login"; }

    @GetMapping("/api/auth/me")
    @ResponseBody
    public Map<String, String> currentUser(org.springframework.security.core.Authentication authentication) {
        boolean administrator = authentication.getAuthorities().stream()
            .anyMatch(authority -> "ROLE_SYSTEM_ADMIN".equals(authority.getAuthority()));
        return Map.of("username", authentication.getName(), "role", administrator ? "SYSTEM_ADMIN" : "EMPLOYEE");
    }
}
