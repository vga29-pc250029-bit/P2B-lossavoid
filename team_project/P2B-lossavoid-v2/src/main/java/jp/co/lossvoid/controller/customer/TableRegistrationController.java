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
 * ルートURLを卓番・人数入力へ案内する。来店入力の画面操作はcustomer.jsが担当する。
 */
@Controller
public class TableRegistrationController {

    @GetMapping({"/", "/index.html"})
    public String entry() { return "redirect:/customer/table"; }

    @GetMapping("/customer/table")
    public String table() { return "staff/table-register"; }
}
