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
 * 調理画面用URLから共通のKDS画面を表示する。状態更新APIとは別の画面ルート。
 */
@Controller
public class CookingOrderController {

    @GetMapping("/kitchen/cooking")
    public String cooking() { return "kitchen/kds"; }
}
