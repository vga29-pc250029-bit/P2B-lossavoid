package jp.co.lossvoid.controller.admin;

<<<<<<< HEAD

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
=======
=======
>>>>>>> c629c30115ca3586bbd56df87536805fd66e6ab9
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
public class StaffRegistrationController {
    private final StaffService staffService;
    public StaffRegistrationController(StaffService staffService) {
        this.staffService = staffService;
    }

    @GetMapping("/admin/staff")
    public String list() { return "customer/staff-list"; }

    @GetMapping("/admin/staff/register")
    public String register() { return "customer/staff-register"; }

    @PostMapping("/admin/staff/register")
    public String registerStaff() { return "customer/staff-confirm"; }

    @GetMapping("/api/staff")
    @ResponseBody
    public List<StaffDto> listStaff() { return staffService.getStaff(); }

    @PostMapping("/api/staff")
    @ResponseBody
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public StaffDto create(@Valid @RequestBody StaffRequest request) { return staffService.createStaff(request); }
}
