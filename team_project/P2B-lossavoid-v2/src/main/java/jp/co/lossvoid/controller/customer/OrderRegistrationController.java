package jp.co.lossvoid.controller.customer;

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
public class OrderRegistrationController {
    private final OrderService orderService;
    public OrderRegistrationController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/customer/order/confirm")
    public String confirm() { return "staff/order-confirm"; }

    @PostMapping("/api/orders")
    @ResponseBody
    public OrderDto createOrder(@Valid @RequestBody OrderRequest request) {
        return orderService.createOrder(request);
    }
}
