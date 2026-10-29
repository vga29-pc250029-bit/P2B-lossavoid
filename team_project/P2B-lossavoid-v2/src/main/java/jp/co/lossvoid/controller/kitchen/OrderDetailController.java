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
 * 注文IDに対応する情報をDBから取得し、キッチンの注文詳細テンプレートへ渡す。
 */
@Controller
public class OrderDetailController {
    private final OrderRepository orderRepository;
    public OrderDetailController(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @GetMapping("/kitchen/orders/{orderId}")
    public String detail(@PathVariable Long orderId, Model model) {
        model.addAttribute("order", orderRepository.findById(orderId));
        return "kitchen/order-detail";
    }
}
