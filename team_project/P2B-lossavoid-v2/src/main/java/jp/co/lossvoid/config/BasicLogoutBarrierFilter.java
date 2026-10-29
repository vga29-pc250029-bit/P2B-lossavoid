package jp.co.lossvoid.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import org.springframework.http.HttpHeaders;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * HTTP Basicの認証情報がブラウザーで再利用される場合に備え、ログアウト後の管理画面アクセスを一度401にする。
 */
public class BasicLogoutBarrierFilter extends OncePerRequestFilter {
    public static final String COOKIE_NAME = "ORDER_BASIC_LOGOUT";

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String path = request.getServletPath();
        boolean loginPage = "/admin.html".equals(path) || "/admin".equals(path)
            || path.startsWith("/admin/") || "/staff/login".equals(path);
        // ログアウトCookieを見た最初の管理アクセスを401にし、Cookieを消して次の通常認証へ戻す。
        if (loginPage && hasLogoutCookie(request)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"Order Admin Login\"");
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
            response.addHeader(
                HttpHeaders.SET_COOKIE,
                COOKIE_NAME + "=; Max-Age=0; Path="
                    + (request.getContextPath().isEmpty() ? "/" : request.getContextPath())
                    + "; HttpOnly; SameSite=Strict"
            );
            return;
        }
        filterChain.doFilter(request, response);
    }

    private boolean hasLogoutCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        return cookies != null && Arrays.stream(cookies)
            .anyMatch(cookie -> COOKIE_NAME.equals(cookie.getName()) && "1".equals(cookie.getValue()));
    }
}
