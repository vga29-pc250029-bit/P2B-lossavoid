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

@Controller
public class OrderEditController {
    private final OrderService orderService;
    public OrderEditController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/admin/orders/edit")
    public String edit() { return "customer/order-edit"; }

    @GetMapping("/admin/orders/merge")
    public String merge() { return "customer/order-merge"; }

    @PatchMapping("/api/orders/{orderId}/table")
    @ResponseBody
    public Map<String, Boolean> changeTable(@PathVariable Long orderId,
            @Valid @RequestBody TableChangeRequest request) {
        orderService.changeTable(orderId, request);
        return Map.of("ok", true);
    }

    @PostMapping("/api/orders/merge")
    @ResponseBody
    public OrderDto mergeOrders(@Valid @RequestBody MergeRequest request) {
        return orderService.mergeOrders(request);
    }
}
