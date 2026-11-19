package jp.co.lossvoid;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/** 元のKDSレイアウトと、外部CSSに依存しない表示を確認する。 */
class KitchenLayoutTest {
    private String resource(String path) throws Exception {
        return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
    }

    @Test
    void keepsBothKitchenRoutesOnTheOriginalToolbarAndTwoPanels() throws Exception {
        for (String page : new String[]{"kds", "served"}) {
            String html = resource("templates/kitchen/" + page + ".html");
            assertTrue(html.contains("class=\"kds-page\""), page);
            assertFalse(html.contains("v2-links"), page);
            assertFalse(html.contains("panel-title"), page);
            assertFalse(html.contains("cdn.tailwindcss.com"), page);
            for (String id : new String[]{"news-btn", "completed-btn", "shift-btn", "delete-btn",
                    "organize-btn", "current-time", "orderContainer", "organizedOrders", "served-modal"}) {
                assertTrue(html.contains("id=\"" + id + "\""), page + ": " + id);
            }
            assertTrue(html.contains("title=\"速報機能は未実装です\""), page);
            assertTrue(html.contains("title=\"シフト確認機能は未実装です\""), page);
            assertTrue(html.contains(">全消去</button>"), page);
        }
    }

    @Test
    void definesEqualWidthPanelsAndStandaloneModalStyles() throws Exception {
        String css = resource("static/css/kitchen.css");
        assertTrue(css.contains("--paper: #f0f0f0"));
        assertTrue(css.contains("--warm: #fff9e6"));
        assertTrue(css.contains("--yellow: #ffcc00"));
        assertTrue(css.contains("grid-template-columns: repeat(2, minmax(0, 1fr))"));
        assertTrue(css.contains("border-left: 2px dashed #333"));
        assertTrue(css.contains("#served-modal {"));
        assertTrue(css.contains(".hidden { display: none !important; }"));
    }

    @Test
    void keepsEmptyPanelsBlankWithoutHidingApiFailures() throws Exception {
        String js = resource("static/js/kitchen.js");
        assertTrue(js.contains("orderContainer.innerHTML = cards.join(\"\")"));
        assertFalse(js.contains("未完了のキッチン伝票はありません"));
        assertFalse(js.contains("上下オーブンの左右2枚と同時調理を考慮して作業順を表示"));
        assertTrue(js.contains("注文データを取得できませんでした"));
        assertTrue(js.contains("window.oracleApi.markKitchenReady(itemId)"));
        assertTrue(js.contains("window.oracleApi.markFloorPicked(itemId)"));
    }

    @Test
    void showsChickenPreparationAsASystemTableOrder() throws Exception {
        String html = resource("templates/kitchen/kds.html");
        String js = resource("static/js/kitchen.js");
        assertFalse(html.contains("chicken-prep-panel"));
        assertTrue(js.contains("table: \"System\""));
        assertTrue(js.contains("data-action=\"${systemChicken ? chickenAction"));
        assertTrue(js.contains("window.oracleApi.updateChickenPrep(batchId"));
        assertTrue(js.contains("System卓から消去します"));
    }

    @Test
    void removesTableSuffixFromTicketsAndOmitsTableFromOrganizedRows() throws Exception {
        String js = resource("static/js/kitchen.js");
        assertTrue(js.contains("<span class=\"table-number\">${escapeHtml(formatTableNo(order.table))}</span>"));
        assertFalse(js.contains("formatTableNo(current.order.table))}卓"));
        assertTrue(js.contains("Sys @ 焼成チキン <span class=\"workflow-qty\">"));
    }

    @Test
    void usesNeutralWordingAfterThePlannedCookInTime() throws Exception {
        String js = resource("static/js/kitchen.js");
        assertTrue(js.contains("投入後（${formatElapsed(-remainingSeconds)}経過）"));
        assertTrue(js.contains("初品6分以降の見込み"));
        assertFalse(js.contains("超過"));
    }
}
