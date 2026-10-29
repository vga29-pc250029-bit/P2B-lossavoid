package jp.co.lossvoid.controller.admin;

import jakarta.validation.Valid;
import java.util.List;
import jp.co.lossvoid.bean.StaffDto;
import jp.co.lossvoid.form.StaffRequest;
import jp.co.lossvoid.service.StaffService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * 担当者一覧・登録画面と従業員の取得・登録APIを提供する。入力検証後の登録処理はStaffServiceへ渡す。
 */
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

    // この画面ルートは確認用テンプレートを返すだけ。実際の登録は下のJSON APIが担当する。
    @PostMapping("/admin/staff/register")
    public String registerStaff() { return "customer/staff-confirm"; }

    @GetMapping("/api/staff")
    @ResponseBody
    public List<StaffDto> listStaff() { return staffService.getStaff(); }

    @PostMapping("/api/staff")
    @ResponseBody
    @ResponseStatus(HttpStatus.CREATED)
    public StaffDto create(@Valid @RequestBody StaffRequest request) { return staffService.createStaff(request); }
}
