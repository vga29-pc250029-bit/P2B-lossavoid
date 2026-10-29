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
 * お客様の注文履歴画面を表示する。このクラス自体は調理・提供状態を更新しない。
 */
@Controller
public class ServingCompletionController {

    @GetMapping("/customer/history")
    public String history() { return "staff/order-history"; }
}
