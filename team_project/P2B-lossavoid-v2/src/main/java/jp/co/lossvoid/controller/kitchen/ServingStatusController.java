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
 * 提供済み商品の確認画面を表示する。対応する画面側処理が履歴を絞り込んで表示する。
 */
@Controller
public class ServingStatusController {

    @GetMapping("/kitchen/served")
    public String served() { return "kitchen/served"; }
}
