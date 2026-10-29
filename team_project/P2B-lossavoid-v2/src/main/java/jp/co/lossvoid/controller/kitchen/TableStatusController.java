package jp.co.lossvoid.controller.kitchen;

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
 * キッチンの注文情報をモデルへ渡し、卓別の状況をテンプレートで表示する。
 */
@Controller
public class TableStatusController {
    private final OrderService orderService;
    public TableStatusController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/kitchen/tables")
    public String tables(Model model) {
        model.addAttribute("orders", orderService.getKitchenOrders());
        return "kitchen/table-status";
    }
}
