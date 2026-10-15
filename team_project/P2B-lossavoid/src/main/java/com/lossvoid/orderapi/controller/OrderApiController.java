package com.lossvoid.orderapi.controller;

import com.lossvoid.orderapi.dto.MenuDto;
import com.lossvoid.orderapi.dto.MergeRequest;
import com.lossvoid.orderapi.dto.OrderDto;
import com.lossvoid.orderapi.dto.OrderRequest;
import com.lossvoid.orderapi.dto.StatusUpdateRequest;
import com.lossvoid.orderapi.dto.TableChangeRequest;
import com.lossvoid.orderapi.repository.MenuRepository;
import com.lossvoid.orderapi.service.OrderService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class OrderApiController {
    private final MenuRepository menuRepository;
    private final OrderService orderService;

    public OrderApiController(MenuRepository menuRepository, OrderService orderService) {
        this.menuRepository = menuRepository;
        this.orderService = orderService;
    }

    @GetMapping("/menus")
    public List<MenuDto> getMenus() {
        return menuRepository.findAll();
    }

    @PatchMapping("/menus/{menuCode}/stock")
    public Map<String, Boolean> updateStock(
        @PathVariable String menuCode,
        @RequestBody Map<String, Object> body
    ) {
        Integer stockQty = body.get("stockQty") == null ? null : Number.class.cast(body.get("stockQty")).intValue();
        Boolean soldOut = body.get("soldOut") == null ? null : Boolean.class.cast(body.get("soldOut"));
        menuRepository.updateStock(menuCode, stockQty, soldOut);
        return Map.of("ok", true);
    }

    @PostMapping("/orders")
    public OrderDto createOrder(@Valid @RequestBody OrderRequest request) {
        return orderService.createOrder(request);
    }

    @GetMapping("/orders")
    public List<OrderDto> getOrdersByTable(@RequestParam String tableNo) {
        return orderService.getOrdersByTable(tableNo);
    }

    @PatchMapping("/orders/{orderId}/table")
    public Map<String, Boolean> changeTable(
        @PathVariable Long orderId,
        @Valid @RequestBody TableChangeRequest request
    ) {
        orderService.changeTable(orderId, request);
        return Map.of("ok", true);
    }

    @PostMapping("/orders/merge")
    public OrderDto mergeOrders(@Valid @RequestBody MergeRequest request) {
        return orderService.mergeOrders(request);
    }

    @PatchMapping("/orders/{orderId}/cancel")
    public Map<String, Boolean> cancelOrder(@PathVariable Long orderId) {
        orderService.cancelOrder(orderId);
        return Map.of("ok", true);
    }

    @PatchMapping("/orders/{orderId}/items/{orderItemId}/cancel-one")
    public Map<String, Boolean> cancelOneItem(
        @PathVariable Long orderId,
        @PathVariable Long orderItemId
    ) {
        orderService.cancelOneItem(orderId, orderItemId);
        return Map.of("ok", true);
    }

    @GetMapping("/kitchen/orders")
    public List<OrderDto> getKitchenOrders() {
        return orderService.getKitchenOrders();
    }

    @PatchMapping("/kitchen/order-items/{orderItemId}")
    public Map<String, Boolean> updateKitchenItem(
        @PathVariable Long orderItemId,
        @Valid @RequestBody StatusUpdateRequest request
    ) {
        orderService.updateItemStatus(orderItemId, request);
        return Map.of("ok", true);
    }
}
