package com.lossvoid.orderapi;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.lossvoid.orderapi.controller.AuthController;
import com.lossvoid.orderapi.dto.StaffAccount;
import com.lossvoid.orderapi.repository.StaffRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import jakarta.servlet.http.Cookie;

@WebMvcTest(AuthController.class)
@Import(SecurityConfig.class)
class SecurityConfigTest {
    @Autowired
    private MockMvc mvc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockBean
    private StaffRepository staffRepository;

    @Test
    void rejectsRequestsWithoutBasicAuthentication() throws Exception {
        mvc.perform(get("/api/auth/me"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void authenticatesTheBootstrapAdministrator() throws Exception {
        mvc.perform(get("/api/auth/me").with(httpBasic("admin", "sanko3535")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"))
            .andExpect(jsonPath("$.role").value("SYSTEM_ADMIN"));
    }

    @Test
    void authenticatesAnEnabledEmployeeFromOracle() throws Exception {
        when(staffRepository.findAccount("T001")).thenReturn(Optional.of(
            new StaffAccount("T001", "担当者", passwordEncoder.encode("test1234"), "EMPLOYEE", true)
        ));

        mvc.perform(get("/api/auth/me").with(httpBasic("T001", "test1234")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("T001"))
            .andExpect(jsonPath("$.role").value("EMPLOYEE"));
    }

    @Test
    void armsTheNextAdminRequestForARealBasicAuthenticationPrompt() throws Exception {
        mvc.perform(post("/api/auth/logout"))
            .andExpect(status().isNoContent())
            .andExpect(cookie().value(BasicLogoutBarrierFilter.COOKIE_NAME, "1"));

        mvc.perform(get("/admin.html")
                .cookie(new Cookie(BasicLogoutBarrierFilter.COOKIE_NAME, "1"))
                .with(httpBasic("admin", "sanko3535")))
            .andExpect(status().isUnauthorized())
            .andExpect(header().string("WWW-Authenticate", "Basic realm=\"Order Admin Login\""))
            .andExpect(cookie().maxAge(BasicLogoutBarrierFilter.COOKIE_NAME, 0));
    }
}
