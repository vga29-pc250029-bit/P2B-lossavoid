package jp.co.lossvoid;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/**
 * 共通CSSの空ファイル化と、ポップアップが本文へ露出する不具合の再発を検出する。
 */
class CustomerStylesheetTest {
    private String customerCss() throws Exception {
        return new ClassPathResource("static/css/customer.css")
            .getContentAsString(StandardCharsets.UTF_8);
    }

    @Test
    void shipsTheCustomerPageLayoutInsteadOfAnEmptyStylesheet() throws Exception {
        String css = customerCss();
        assertFalse(css.isBlank(), "Customer pages require their shared stylesheet");
        for (String selector : new String[]{"html, body", ".header-green", ".page", ".menu-grid", ".footer-nav"}) {
            assertTrue(css.contains(selector), () -> "Missing customer layout: " + selector);
        }
        assertTrue(Pattern.compile("\\.hidden\\s*\\{[^}]*display:\\s*none\\s*!important", Pattern.DOTALL)
            .matcher(css).find(), "Hidden entry-page controls must stay hidden");
    }

    @Test
    void keepsProductAndQuantityOverlaysOutOfThePageFlowUntilOpened() throws Exception {
        String css = customerCss();
        for (String overlay : new String[]{"#info-overlay", "#qty-overlay"}) {
            var rule = Pattern.compile(Pattern.quote(overlay) + "\\s*\\{([^}]*)}", Pattern.DOTALL).matcher(css);
            assertTrue(rule.find(), () -> "Missing modal rule: " + overlay);
            String declarations = rule.group(1);
            assertTrue(declarations.contains("position: fixed"), overlay);
            assertTrue(declarations.contains("opacity: 0"), overlay);
            assertTrue(declarations.contains("pointer-events: none"), overlay);
            assertTrue(css.contains(overlay + ".show"), overlay + " must still be openable");
        }
    }
}
