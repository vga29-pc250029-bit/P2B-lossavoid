
package jp.co.lossvoid.controller.admin;

import java.util.Map;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;

import jakarta.validation.Valid;
import jp.co.lossvoid.bean.StaffDto;
import jp.co.lossvoid.form.StaffRequest;
import jp.co.lossvoid.service.StaffService;

/**
 * スタッフの更新と削除を行う。
 * スタッフの編集画面も表示する。
 */
@Controller
public class StaffUpdateController {

    private final StaffService staffService;

    // StaffServiceを使えるようにする
    public StaffUpdateController(StaffService staffService) {
        this.staffService = staffService;
    }

    // スタッフ更新画面を表示する
    @GetMapping("/admin/staff/update")
    public String update() {
        return "customer/staff-update"; 
    }

    // スタッフの情報を更新する
    @PutMapping("/api/staff/{code}")
    @ResponseBody
    public StaffDto updateStaff(@PathVariable String code, @Valid @RequestBody StaffRequest request) {
        return staffService.updateStaff(code, request);
    }

    // スタッフを削除する
    @DeleteMapping("/api/staff/{code}")
    @ResponseBody
    public Map<String, Boolean> deleteStaff(@PathVariable String code) {
        return staffService.deleteStaff(code);
    }
}
