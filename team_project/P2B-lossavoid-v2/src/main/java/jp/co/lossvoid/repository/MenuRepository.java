package jp.co.lossvoid.repository;

import jp.co.lossvoid.bean.MenuDto;
import java.util.Arrays;
import java.util.List;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * OracleのMENUSを画面用DTOへ変換し、在庫を更新する。数値の商品IDは画面側では文字列コードとして扱う。
 */
@Repository
public class MenuRepository {
    private final JdbcTemplate jdbcTemplate;

    public MenuRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<MenuDto> findAll() {
        return jdbcTemplate.query("""
            SELECT TO_CHAR(MENU_ID) AS MENU_CODE, MENU_NAME, PRICE, CATEGORY, PREP_STATION,
                   STANDARD_COOK_TIME AS COOK_TIME_MIN, STOCK_QTY, SOLD_OUT, ALLERGY_INFO AS ALLERGENS
            FROM MENUS
            ORDER BY MENU_ID
            """, (rs, rowNum) -> new MenuDto(
                rs.getString("MENU_CODE"),
                rs.getString("MENU_NAME"),
                rs.getInt("PRICE"),
                rs.getString("CATEGORY"),
                rs.getString("PREP_STATION"),
                rs.getObject("COOK_TIME_MIN", Integer.class),
                imageUrl(rs.getString("MENU_NAME")),
                rs.getObject("STOCK_QTY", Integer.class),
                rs.getInt("SOLD_OUT") == 1,
                splitAllergens(rs.getString("ALLERGENS"))
            ));
    }

    // 日本語の商品名を画像ファイル名として使うため、URLのパス部分としてエンコードする。
    private String imageUrl(String menuName) {
        return "/images/" + URLEncoder.encode(menuName, StandardCharsets.UTF_8).replace("+", "%20") + ".png";
    }

    // nullは値のクリアではなく変更なしとして扱う。品切れフラグはOracleの0・1へ変換する。
    public void updateStock(String menuCode, Integer stockQty, Boolean soldOut) {
        jdbcTemplate.update("""
            UPDATE MENUS
            SET STOCK_QTY = COALESCE(?, STOCK_QTY),
                SOLD_OUT = COALESCE(?, SOLD_OUT)
            WHERE MENU_ID = ?
            """, stockQty, soldOut == null ? null : soldOut ? 1 : 0, Long.parseLong(menuCode));
    }

    private List<String> splitAllergens(String value) {
        if (value == null || value.isBlank()) return List.of();
        return Arrays.stream(value.split(","))
            .map(String::trim)
            .filter(item -> !item.isEmpty())
            .toList();
    }
}
