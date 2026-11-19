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
 * 調理順を扱うKDS画面と、作業順を記録するシミュレーター画面への入口。
 */
@Controller
public class CookingPriorityController {

    @GetMapping("/kitchen/priority")
    public String priority() { return "kitchen/kds"; }

    @GetMapping({"/kitchen/simulator", "/scheduler-simulator.html"})
    public String simulator() { return "kitchen/simulator"; }
}
