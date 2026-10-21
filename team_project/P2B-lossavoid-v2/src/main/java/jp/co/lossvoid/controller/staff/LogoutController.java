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

@Controller
public class LogoutController {

    @GetMapping({"/staff/logout", "/logout.html"})
    public String logoutPage() { return "staff/logout"; }

    @PostMapping("/api/auth/logout")
    public org.springframework.http.ResponseEntity<Void> logout(jakarta.servlet.http.HttpServletResponse response) {
        response.addHeader("Set-Cookie", jp.co.lossvoid.config.BasicLogoutBarrierFilter.COOKIE_NAME
            + "=1; Max-Age=120; Path=/; HttpOnly; SameSite=Strict");
        return org.springframework.http.ResponseEntity.noContent().header("Cache-Control", "no-store").build();
    }
}
