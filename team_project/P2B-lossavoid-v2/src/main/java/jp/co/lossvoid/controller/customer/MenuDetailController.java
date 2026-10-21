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
public class MenuDetailController {
    private final MenuRepository menuRepository;
    public MenuDetailController(MenuRepository menuRepository) {
        this.menuRepository = menuRepository;
    }

    @GetMapping("/customer/menu/{code}")
    public String detail(@PathVariable String code, Model model) {
        model.addAttribute("menuCode", code);
        return "staff/menu-detail";
    }
}
