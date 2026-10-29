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
 * KDS画面とその注文取得APIを提供する。調理順の計算は画面側のスケジューラーが行う。
 */
@Controller
public class OrderListController {
    private final OrderService orderService;
    public OrderListController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping({"/kitchen", "/kitchen.html"})
    public String kitchen() { return "kitchen/kds"; }

    @GetMapping("/api/kitchen/orders")
    @ResponseBody
    public List<OrderDto> getKitchenOrders() { return orderService.getKitchenOrders(); }
}
