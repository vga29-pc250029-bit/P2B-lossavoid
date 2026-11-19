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

/**
 * 数量選択URLを直接開く場合の入口。商品コードと数量選択モードを渡し、一覧を背景にポップアップを開く。
 */
@Controller
public class CartAddController {

    @GetMapping("/customer/menu/{code}/quantity")
    public String quantity(@PathVariable String code, Model model) {
        model.addAttribute("menuCode", code);
        model.addAttribute("quantityMode", true);
        return "staff/menu-detail";
    }
}
