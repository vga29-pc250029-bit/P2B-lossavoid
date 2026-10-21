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

public class BasicLogoutBarrierFilter extends OncePerRequestFilter {
    public static final String COOKIE_NAME = "ORDER_BASIC_LOGOUT";

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String path = request.getRequestURI();
        boolean loginPage = "/admin.html".equals(path) || "/admin".equals(path)
            || path.startsWith("/admin/") || "/staff/login".equals(path);
        if (loginPage && hasLogoutCookie(request)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"Order Admin Login\"");
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
            response.addHeader(
                HttpHeaders.SET_COOKIE,
                COOKIE_NAME + "=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict"
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
