package jp.co.lossvoid;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.LocalDateTime;
import java.util.List;
import jp.co.lossvoid.bean.OrderDto;
import jp.co.lossvoid.config.SecurityConfig;
import jp.co.lossvoid.repository.MenuRepository;
import jp.co.lossvoid.repository.OrderRepository;
import jp.co.lossvoid.repository.StaffRepository;
import jp.co.lossvoid.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest
@Import(SecurityConfig.class)
class MigrationRoutesTest {
    @Autowired MockMvc mvc;
    @MockitoBean MenuRepository menuRepository;
    @MockitoBean OrderRepository orderRepository;
    @MockitoBean StaffRepository staffRepository;
    @MockitoBean OrderService orderService;
    @MockitoBean StaffService staffService;
    @MockitoBean AllergyService allergyService;
    @MockitoBean KitchenUpdateBroadcaster kitchenUpdateBroadcaster;

    @Test
    void rendersTheSeparatedCustomerPages() throws Exception {
        mvc.perform(get("/")).andExpect(redirectedUrl("/customer/table"));
        for (String path : List.of("/customer/table", "/customer/menu", "/customer/cart", "/customer/history",
                "/customer/order/confirm", "/customer/menu/2101", "/customer/menu/2101/quantity")) {
            mvc.perform(get(path)).andExpect(status().isOk());
        }
    }

    @Test
    void rendersAllAdministrativePagesForAnAdministrator() throws Exception {
        for (String path : List.of("/admin", "/admin/orders/new", "/admin/orders/cart", "/admin/orders/confirm",
                "/admin/orders", "/admin/orders/edit", "/admin/orders/cancel", "/admin/orders/merge",
                "/admin/stock", "/admin/allergens", "/admin/staff", "/admin/staff/register",
                "/admin/staff/update", "/admin/staff/confirm", "/staff/login")) {
            mvc.perform(get(path).with(user("admin").roles("SYSTEM_ADMIN"))).andExpect(status().isOk());
        }
    }

    @Test
    void preservesAdministratorAndEmployeeAccess() throws Exception {
        mvc.perform(get("/admin")).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin").with(user("T001").roles("EMPLOYEE"))).andExpect(status().isOk());
        mvc.perform(get("/admin/staff").with(user("T001").roles("EMPLOYEE"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/staff").with(user("T001").roles("EMPLOYEE"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me").with(httpBasic("admin", "sanko3535")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("SYSTEM_ADMIN"));
    }

    @Test
    void rendersKitchenPagesAndTheOrderDetail() throws Exception {
        when(orderService.getKitchenOrders()).thenReturn(List.of());
        when(orderRepository.findById(1L)).thenReturn(new OrderDto(1L, "01", 2, "WAITING", "SELF", LocalDateTime.now(), List.of()));
        for (String path : List.of("/kitchen", "/kitchen/served", "/kitchen/tables", "/kitchen/orders/1",
                "/kitchen/tasks", "/kitchen/cooking", "/kitchen/priority", "/kitchen/simulator")) {
            mvc.perform(get(path)).andExpect(status().isOk());
        }
    }

    @Test
    void keepsOrderValidationAndIndividualCancellation() throws Exception {
        mvc.perform(post("/api/orders").contentType("application/json").content("""
            {"table":"01","guestCount":0,"orderMethod":"SELF",
             "items":[{"code":"2101","name":"Doria","price":300,"qty":1}]}
            """)).andExpect(status().isBadRequest());
        mvc.perform(patch("/api/orders/1/items/2/cancel-one")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/orders/1/items/2/cancel-one").with(user("T001").roles("EMPLOYEE")))
            .andExpect(status().isOk());
        verify(orderService).cancelOneItem(1L, 2L);
    }
}
