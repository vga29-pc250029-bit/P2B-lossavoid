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

@Controller
public class StaffOrderController {
    private final MenuRepository menuRepository;
    public StaffOrderController(MenuRepository menuRepository) {
        this.menuRepository = menuRepository;
    }

    @GetMapping({"/admin", "/admin.html"})
    public String home() { return "customer/top"; }

    @GetMapping({"/admin/orders/new", "/Order.html"})
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

    @PatchMapping("/api/menus/{menuCode}/stock")
    @ResponseBody
    public Map<String, Boolean> updateStock(@PathVariable String menuCode, @RequestBody Map<String, Object> body) {
        Integer stockQty = body.get("stockQty") == null ? null : Number.class.cast(body.get("stockQty")).intValue();
        Boolean soldOut = body.get("soldOut") == null ? null : Boolean.class.cast(body.get("soldOut"));
        menuRepository.updateStock(menuCode, stockQty, soldOut);
        return Map.of("ok", true);
    }
}
