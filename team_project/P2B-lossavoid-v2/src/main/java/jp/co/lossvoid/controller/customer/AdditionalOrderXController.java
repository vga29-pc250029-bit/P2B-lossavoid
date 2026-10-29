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
 * 追加注文用URLをメニュー一覧へ転送する。転送だけでは注文を登録しない。
 */
@Controller
public class AdditionalOrderXController {

    @GetMapping("/customer/additional")
    public String additional() { return "redirect:/customer/menu"; }
}
