package com.lossvoid.orderapi;

import com.lossvoid.orderapi.dto.StaffAccount;
import com.lossvoid.orderapi.repository.StaffRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;

@Configuration
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
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.POST, "/api/auth/logout").permitAll()
                .requestMatchers("/admin.html", "/api/auth/me").authenticated()
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
