package jp.co.lossvoid.repository;

import jp.co.lossvoid.bean.MenuDto;
import java.util.Arrays;
import java.util.List;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MenuRepository {
    private final JdbcTemplate jdbcTemplate;

    public MenuRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<MenuDto> findAll() {
        return jdbcTemplate.query("""
            SELECT MENU_CODE, MENU_NAME, PRICE, CATEGORY, PREP_STATION, COOK_TIME_MIN,
                   STOCK_QTY, SOLD_OUT, ALLERGENS
            FROM MENU_MASTER
            ORDER BY MENU_CODE
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

    private String imageUrl(String menuName) {
        return "/images/" + URLEncoder.encode(menuName, StandardCharsets.UTF_8).replace("+", "%20") + ".png";
    }

    public void updateStock(String menuCode, Integer stockQty, Boolean soldOut) {
        jdbcTemplate.update("""
            UPDATE MENU_MASTER
            SET STOCK_QTY = COALESCE(?, STOCK_QTY),
                SOLD_OUT = COALESCE(?, SOLD_OUT)
            WHERE MENU_CODE = ?
            """, stockQty, soldOut == null ? null : soldOut ? 1 : 0, menuCode);
    }

    private List<String> splitAllergens(String value) {
        if (value == null || value.isBlank()) return List.of();
        return Arrays.stream(value.split(","))
            .map(String::trim)
            .filter(item -> !item.isEmpty())
            .toList();
    }
}
