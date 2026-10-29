package jp.co.lossvoid.controller.admin;

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
 * 従業員コードを指定した更新・削除APIと編集画面を提供する。利用権限はSecurityConfigで制限する。
 */
@Controller
public class StaffUpdateController {
    private final StaffService staffService;
    public StaffUpdateController(StaffService staffService) {
        this.staffService = staffService;
    }

    @GetMapping("/admin/staff/update")
    public String update() { return "customer/staff-update"; }

    @PutMapping("/api/staff/{code}")
    @ResponseBody
    public StaffDto updateStaff(@PathVariable String code, @Valid @RequestBody StaffRequest request) {
        return staffService.updateStaff(code, request);
    }

    @DeleteMapping("/api/staff/{code}")
    @ResponseBody
    public Map<String, Boolean> deleteStaff(@PathVariable String code) { return staffService.deleteStaff(code); }
}
