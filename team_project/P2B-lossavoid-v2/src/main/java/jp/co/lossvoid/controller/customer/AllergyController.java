package jp.co.lossvoid.controller.customer;

import tools.jackson.databind.JsonNode;
import jp.co.lossvoid.service.AllergyService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/allergens")
public class AllergyController {
    private final AllergyService allergyService;

    public AllergyController(AllergyService allergyService) {
        this.allergyService = allergyService;
    }

    @GetMapping
    public JsonNode getAllergens() {
        try {
            return allergyService.getOfficialItems();
        } catch (RuntimeException error) {
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "公式アレルギー情報を取得できませんでした",
                error
            );
        }
    }
}
