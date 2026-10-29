package jp.co.lossvoid.controller.admin;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 従業員・管理者の各画面を返す入口。画面の表示と、注文を保存するAPI処理は分離している。
 */
@Controller
public class StaffOrderController {

    @GetMapping({"/admin", "/admin.html", "/Order.html"})
    public String home() { return "customer/top"; }

    @GetMapping("/admin/orders/new")
    public String order() { return "customer/staff-order"; }

    @GetMapping("/admin/orders/cart")
    public String cart() { return "customer/staff-cart"; }

    @GetMapping("/admin/orders/confirm")
    public String confirm() { return "customer/order-confirm"; }

    @GetMapping("/admin/stock")
    public String stock() { return "customer/stock"; }

    @GetMapping("/admin/allergens")
    public String allergens() { return "customer/allergens"; }

    @GetMapping("/admin/staff/confirm")
    public String staffConfirm() { return "customer/staff-confirm"; }

    // 卓番・人数登録画面を表示
    @GetMapping("/staff/orders")
    public String showOrderRegister() {
        return "staff/table-register";
    }

    // 卓番・人数を登録してメニュー一覧へ進む
    @PostMapping("/staff/orders/start")
    public String startOrder(
            @RequestParam("tableNo") String tableNo,
            @RequestParam("numberOfPeople") int numberOfPeople,
            Model model) {

        model.addAttribute("tableNo", tableNo);
        model.addAttribute("numberOfPeople", numberOfPeople);

        return "staff/menu-list";
    }
}
