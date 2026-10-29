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
 * 注文全体の取消と、提供済みも含む商品1個の取消を別APIとして扱う。保存後のKDS通知はサービス層で行う。
 */
@Controller
public class OrderCancelController {
    private final OrderService orderService;
    public OrderCancelController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/admin/orders/cancel")
    public String cancel() { return "customer/order-cancel"; }

    @PatchMapping("/api/orders/{orderId}/cancel")
    @ResponseBody
    public Map<String, Boolean> cancelOrder(@PathVariable Long orderId) {
        orderService.cancelOrder(orderId);
        return Map.of("ok", true);
    }

    @PatchMapping("/api/orders/{orderId}/items/{orderItemId}/cancel-one")
    @ResponseBody
    public Map<String, Boolean> cancelItem(@PathVariable Long orderId, @PathVariable Long orderItemId) {
        orderService.cancelOneItem(orderId, orderItemId);
        return Map.of("ok", true);
    }
}
