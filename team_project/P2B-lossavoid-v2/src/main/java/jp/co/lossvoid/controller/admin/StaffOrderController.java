package jp.co.lossvoid.controller.admin;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
@RequestMapping("/staff/orders")
public class StaffOrderController {

    // 卓番・人数登録画面を表示
    @GetMapping
    public String showOrderRegister() {
        return "staff/table-register";
    }

    // 卓番・人数を登録してメニュー一覧へ進む
    @PostMapping("/start")
    public String startOrder(
            @RequestParam("tableNo") String tableNo,
            @RequestParam("numberOfPeople") int numberOfPeople,
            Model model) {

        model.addAttribute("tableNo", tableNo);
        model.addAttribute("numberOfPeople", numberOfPeople);

        return "staff/menu-list";
    }
}
