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
 * 調理タスク用URLから共通のKDS画面を返す。タスク表示の内容はJavaScriptがAPIから取得する。
 */
@Controller
public class CookingTaskController {

    @GetMapping("/kitchen/tasks")
    public String tasks() { return "kitchen/kds"; }
}
