package jp.co.lossvoid.controller.admin;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/admin/staff")
public class StaffRegistrationController {

    // 担当者情報登録画面を表示
    @GetMapping("/register")
    public String showRegistrationForm() {
        return "customer/staff-register";
    }

    // 担当者情報を登録
    @PostMapping("/register")
    public String registerStaff() {
        return "customer/staff-confirm";
    }
}
