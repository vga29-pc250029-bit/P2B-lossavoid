# 通常版からv2への移植記録

2026-10-21

移植元: `../P2B-lossavoid`

通常版のJava、HTML、CSS、JavaScript、商品画像を機能ごとに分割して移植した。
通常版のソースは変更していない。機能追加・業務ルールの見直しは別途行う。

## 起動

JDK 17で、このフォルダから実行する。

```powershell
.\mvnw.cmd spring-boot:run
```

標準URLは `http://127.0.0.1:10000/`。
通常版の9999番とは別に起動できる。ポートは `SERVER_PORT` 環境変数で変更可能。
Eclipseでは `P2BLossavoidV2Application.java` をJavaアプリケーションとして実行する。

Oracle接続は通常版と同じ `localhost:1521/XEPDB1`、`ORDER_APP` を引き継いでいる。
両サイトの保存先は同じDBであり、独立したデータベースを複製したものではない。
`ORACLE_URL`、`ORACLE_USERNAME`、`ORACLE_PASSWORD` で接続先を変更できる。
`schema.sql` と `seed.sql` は参照用にコピーした。自動実行は `never` のため、起動時にメニューを上書きしない。

管理者の初期認証は通常版の設定を引き継ぐ。
HTTP Basic認証、担当者のBCryptパスワード、有効状態、管理者/従業員の権限を移植している。

## 画面とControllerの対応

v2に先に用意されていたテンプレートのフォルダ名を保持している。
このため、顧客注文画面は `templates/staff`、管理画面は `templates/customer` に配置されている。

| 画面/URL | Controller | テンプレート |
| --- | --- | --- |
| `/customer/table` 卓番・人数 | TableRegistrationController | staff/table-register.html |
| `/customer/menu` メニュー | MenuListController | staff/menu-list.html |
| `/customer/menu/{code}` 商品情報 | MenuDetailController | staff/menu-detail.html |
| `/customer/menu/{code}/quantity` 数量 | CartAddController | staff/menu-detail.html |
| `/customer/cart` 注文かご | CartController | staff/cart.html |
| `/customer/order/confirm` 注文確認 | OrderRegistrationController | staff/order-confirm.html |
| `/customer/history` 注文履歴 | ServingCompletionController | staff/order-history.html |
| `/customer/additional` 追加注文 | AdditionalOrderXController | メニューへ遷移 |
| `/admin` 管理ホーム | StaffOrderController | customer/top.html |
| `/admin/orders/new` 従業員注文 | StaffOrderController | customer/staff-order.html |
| `/admin/orders/cart` 注文かご | StaffOrderController | customer/staff-cart.html |
| `/admin/orders/confirm` 注文確認 | StaffOrderController | customer/order-confirm.html |
| `/admin/orders` 注文済み商品 | OrderHistoryController | customer/order-management.html |
| `/admin/orders/cancel` 商品取消 | OrderCancelController | customer/order-cancel.html |
| `/admin/orders/edit` 卓番変更 | OrderEditController | customer/order-edit.html |
| `/admin/orders/merge` 合算 | OrderEditController | customer/order-merge.html |
| `/admin/stock` 在庫 | StaffOrderController | customer/stock.html |
| `/admin/allergens` アレルギー | StaffOrderController | customer/allergens.html |
| `/admin/staff` 担当者一覧 | StaffRegistrationController | customer/staff-list.html |
| `/admin/staff/register` 担当者登録 | StaffRegistrationController | customer/staff-register.html |
| `/admin/staff/update?code=...` 担当者変更 | StaffUpdateController | customer/staff-update.html |
| `/admin/staff/confirm` メンバー確認 | StaffOrderController | customer/staff-confirm.html |
| `/staff/login` 認証 | LoginController | staff/login.html |
| `/staff/logout` ログアウト | LogoutController | staff/logout.html |
| `/kitchen` KDS | OrderListController | kitchen/kds.html |
| `/kitchen/cooking` 調理順 | CookingOrderController | kitchen/kds.html |
| `/kitchen/priority` 優先順位 | CookingPriorityController | kitchen/kds.html |
| `/kitchen/tasks` 調理タスク | CookingTaskController | kitchen/kds.html |
| `/kitchen/served` 提供済み | ServingStatusController | kitchen/served.html |
| `/kitchen/tables` 卓状況 | TableStatusController | kitchen/table-status.html |
| `/kitchen/orders/{orderId}` 注文詳細 | OrderDetailController | kitchen/order-detail.html |
| `/kitchen/simulator` 調理順シミュレーター | CookingPriorityController | kitchen/simulator.html |

`index.html`、`admin.html`、`Order.html`、`kitchen.html`、`logout.html`、`scheduler-simulator.html` の旧URLもControllerで受け付ける。

## Javaの移植先

| 通常版 | v2 |
| --- | --- |
| dtoの表示用record | bean/MenuDto、OrderDto、OrderItemDto、StaffDto、StaffAccount |
| dtoの入力用record | form/OrderRequest、OrderItemRequest、MergeRequest、StaffRequest、StatusUpdateRequest、TableChangeRequest |
| MenuRepository、OrderRepository、StaffRepository | repository配下へSQLを移植 |
| OrderService | service/OrderService |
| StaffControllerの登録・更新・削除処理 | service/StaffServiceとadmin側Controllerへ分割 |
| SecurityConfig、WebConfig、BasicLogoutBarrierFilter、StaffSchemaInitializer | config配下 |
| KitchenEventController、KitchenUpdateBroadcaster | controller/kitchenとservice配下 |
| AllergyController、AllergyService | controller/customerとservice配下 |

通常版の `OrderApiController` はメニュー・注文登録・履歴・卓番変更・合算・取消・KDS更新を、v2の対応するControllerへ分割した。
REST APIのURLとJSON形式は通常版と同じ。商品の1個単位登録・取消、提供状態、SSE通知を引き継いでいる。
入力検証は移植したformのJakarta Validationを使用する。
`entity.java`、`validator.java` など既存の汎用的な空の雛形はそのまま保持し、未実装の機能は追加していない。

## HTMLと共通部品

- 通常版 `index.html` の人数・メニュー・商品詳細・注文かご・注文履歴を各HTMLへ抽出。
- メニューのinfoボタンは画面遷移せず、商品情報ポップアップを表示する。
- 通常版 `admin.html` のホーム・注文・注文済み取消・卓番変更・合算・在庫・担当者画面を各HTMLへ抽出。
- 通常版 `kitchen.html` のKDSと提供済み一覧を移植。調理順の計算処理は `kitchen-scheduler.js` をそのまま使用。
- CSSは `static/css`、画面共通の処理は `static/js/customer.js`、`admin.js`、`kitchen.js` へ抽出。
- `static/images` は通常版から同じ画像をコピー。画像URL・API URLはルート相対に統一。
- 各ページの遷移時は、顧客と従業員の注文かごを別のsessionStorageキーで保存。卓番を変更した場合、別卓の注文かごを引き継がない。
- 管理画面に残っていたFirestoreのメニュー取得・在庫更新・伝票読込はOracle APIへ接続。

通常版 `update.html` はFirestoreのCookListを全削除・再登録する旧作業ツールのため、
`migration-reference/update.html.txt` に参考資料として保存した。Oracleの業務画面からは呼び出さない。

## 確認

```powershell
.\mvnw.cmd test
node --test tests/kitchen-scheduler.test.cjs
```

画面のルート、管理者・従業員の権限、注文入力検証、1個取消、商品1個単位登録のテストを実装。
ブラウザではページ間の注文かご引き継ぎ・再読込、商品画像、担当者編集、KDS整理・提供済み表示を確認。
送信・提供済み更新のブラウザ検証はテスト応答で実施し、実注文を書き込まない方式を使用した。
