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
 * お客様向けメニュー画面と商品一覧APIを提供する。画像URLにはアプリのコンテキストパスを補う。
 */
@Controller
public class MenuListController {
    private final MenuRepository menuRepository;
    public MenuListController(MenuRepository menuRepository) {
        this.menuRepository = menuRepository;
    }

    @GetMapping("/customer/menu")
    public String menu() { return "staff/menu-list"; }

    @GetMapping("/api/menus")
    @ResponseBody
    public List<MenuDto> getMenus(jakarta.servlet.http.HttpServletRequest request) {
        // アプリをルート以外へ配置しても画像を取得できるよう、サーバーの配置先を応答の画像URLに付ける。
        String contextPath = request.getContextPath();
        return menuRepository.findAll().stream().map(menu -> new MenuDto(
            menu.code(), menu.name(), menu.price(), menu.category(), menu.prepStation(), menu.cookTime(),
            contextPath + menu.imageUrl(), menu.stockQty(), menu.soldOut(), menu.allergens()
        )).toList();
    }
}
