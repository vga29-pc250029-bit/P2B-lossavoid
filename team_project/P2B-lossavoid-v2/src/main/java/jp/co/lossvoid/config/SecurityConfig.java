package jp.co.lossvoid.config;

import jp.co.lossvoid.bean.StaffAccount;
import jp.co.lossvoid.repository.StaffRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;

/**
 * 初期管理者とDB上の従業員をHTTP Basicで認証し、担当者管理などのURLに権限を設定する。
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    UserDetailsService userDetailsService(
        StaffRepository staffRepository,
        PasswordEncoder passwordEncoder,
        @Value("${app.security.admin.username}") String adminUsername,
        @Value("${app.security.admin.password}") String adminPassword
    ) {
        // 設定の初期管理者を先に照合する。従業員は有効かつハッシュ登録済みのDBレコードだけを認証対象にする。
        String adminHash = passwordEncoder.encode(adminPassword);
        return username -> {
            if (adminUsername.equalsIgnoreCase(username)) {
                return User.withUsername(adminUsername)
                    .password(adminHash)
                    .roles("SYSTEM_ADMIN")
                    .build();
            }
            StaffAccount account = staffRepository.findAccount(username)
                .filter(StaffAccount::enabled)
                .filter(item -> item.passwordHash() != null && !item.passwordHash().isBlank())
                .orElseThrow(() -> new UsernameNotFoundException("Account not found"));
            String role = "SYSTEM_ADMIN".equals(account.role()) ? "SYSTEM_ADMIN" : "EMPLOYEE";
            return User.withUsername(account.code())
                .password(account.passwordHash())
                .roles(role)
                .build();
        };
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // 既存仕様ではHTTP Basicを使いセッションを作成しない。CSRF設定と保護するURLの変更は別途セキュリティ確認が必要。
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.POST, "/api/auth/logout").permitAll()
                .requestMatchers("/admin/staff", "/admin/staff/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers("/admin", "/admin/**", "/admin.html", "/Order.html", "/staff/login", "/api/auth/me").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/staff/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/staff/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/staff/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/staff/**").hasRole("SYSTEM_ADMIN")
                .requestMatchers(HttpMethod.PATCH, "/api/orders/*/items/*/cancel-one").authenticated()
                .anyRequest().permitAll()
            )
            .addFilterBefore(new BasicLogoutBarrierFilter(), BasicAuthenticationFilter.class)
            .httpBasic(Customizer.withDefaults());
        return http.build();
    }
}
