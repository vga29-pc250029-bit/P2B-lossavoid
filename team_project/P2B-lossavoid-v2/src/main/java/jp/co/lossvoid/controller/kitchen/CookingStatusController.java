package jp.co.lossvoid.controller.kitchen;

import jp.co.lossvoid.bean.*;
import jp.co.lossvoid.form.*;
import jp.co.lossvoid.repository.*;
import jp.co.lossvoid.service.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

@Controller
public class CookingStatusController {
    private final OrderService orderService;
    public CookingStatusController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PatchMapping("/api/kitchen/order-items/{orderItemId}")
    @ResponseBody
    public Map<String, Boolean> updateItem(@PathVariable Long orderItemId,
            @Valid @RequestBody StatusUpdateRequest request) {
        try {
            orderService.updateItemStatus(orderItemId, request);
            return Map.of("ok", true);
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage(), exception);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage(), exception);
        }
    }
}
