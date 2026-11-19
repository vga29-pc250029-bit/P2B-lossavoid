package jp.co.lossvoid.controller.admin;

// 使うクラスを読み込む
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

// 画面の処理を行うクラス
@Controller
public class StaffOrderController {

	// 管理画面を開く
	@GetMapping({ "/admin", "/admin.html", "/Order.html" })
	public String home() {
		return "customer/top";
	}

	// 注文画面を開く
	@GetMapping("/admin/orders/new")
	public String order() {
		return "customer/staff-order";
	}

	// カート画面を開く
	@GetMapping("/admin/orders/cart")
	public String cart() {
		return "customer/staff-cart";
	}

	// 注文確認画面を開く
	@GetMapping("/admin/orders/confirm")
	public String confirm() {
		return "customer/order-confirm";
	}

	// 在庫画面を開く
	@GetMapping("/admin/stock")
	public String stock() {
		return "customer/stock";
	}

	// アレルギー情報を表示する
	@GetMapping("/admin/allergens")
	public String allergens() {
		return "customer/allergens";
	}

	// スタッフの確認画面を開く
	@GetMapping("/admin/staff/confirm")
	public String staffConfirm() {
		return "customer/staff-confirm";
	}

	// 卓番と人数を入力する画面を開く
	@GetMapping("/staff/orders")
	public String showOrderRegister() {
		return "staff/table-register";
	}

	// 入力した卓番と人数を受け取る
	@PostMapping("/staff/orders/start")
	public String startOrder(
			// 卓番を受け取る
			@RequestParam("tableNo") String tableNo,

			// 人数を受け取る
			@RequestParam("numberOfPeople") int numberOfPeople,

			// データを画面に渡す
			Model model) {

		// 卓番を渡す
		model.addAttribute("tableNo", tableNo);

		// 人数を渡す
		model.addAttribute("numberOfPeople", numberOfPeople);

		// メニュー一覧画面を開く
		return "staff/menu-list";
	}
}
