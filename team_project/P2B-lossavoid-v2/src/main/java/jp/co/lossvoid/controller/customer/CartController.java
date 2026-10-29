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
 * お客様の注文かご画面を返す。かごの内容はcustomer.jsがブラウザー内の状態から表示する。
 */
@Controller
public class CartController {

    @GetMapping("/customer/cart")
    public String cart() { return "staff/cart"; }
}
