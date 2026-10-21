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
public class OrderHistoryController {
    private final OrderService orderService;
    public OrderHistoryController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/admin/orders")
    public String management() { return "customer/order-management"; }

    @GetMapping("/api/orders")
    @ResponseBody
    public List<OrderDto> byTable(@RequestParam String tableNo) {
        return orderService.getOrdersByTable(tableNo);
    }
}
