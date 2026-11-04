
package jp.co.lossvoid.controller.admin;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;

import jakarta.validation.Valid;
import jp.co.lossvoid.bean.StaffDto;
import jp.co.lossvoid.form.StaffRequest;
import jp.co.lossvoid.service.StaffService;

/**
 * スタッフの一覧と登録画面を表示する。
 * スタッフの取得と登録も行う。
 */
@Controller
public class StaffRegistrationController {

    private final StaffService staffService;

    // StaffServiceを使えるようにする
    public StaffRegistrationController(StaffService staffService) {
        this.staffService = staffService;
    }

    // スタッフ一覧画面を表示する
    @GetMapping("/admin/staff")
    public String list() {
        return "customer/staff-list";
    }

    // スタッフ登録画面を表示する
    @GetMapping("/admin/staff/register")
    public String register() {
        return "customer/staff-register";
    }

    // スタッフ登録の確認画面を表示する
    @PostMapping("/admin/staff/register")
    public String registerStaff() {
        return "customer/staff-confirm";
    }

    // スタッフの一覧を取得する
    @GetMapping("/api/staff")
    @ResponseBody
    public List<StaffDto> listStaff() {
        return staffService.getStaff();
    }

    // 新しいスタッフを登録する
    @PostMapping("/api/staff")
    @ResponseBody
    @ResponseStatus(HttpStatus.CREATED)
    public StaffDto create(@Valid @RequestBody StaffRequest request) {
        return staffService.createStaff(request);
    }
}
