package jp.co.lossvoid.service;

import tools.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class AllergyService {
    private static final String OFFICIAL_ALLERGY_URL = "https://allergy.saizeriya.co.jp/view?lg=ja";
    private static final Duration CACHE_DURATION = Duration.ofHours(6);

    private final RestClient restClient = RestClient.create();
    private JsonNode cachedItems;
    private Instant cacheExpiresAt = Instant.EPOCH;

    public synchronized JsonNode getOfficialItems() {
        if (cachedItems != null && Instant.now().isBefore(cacheExpiresAt)) {
            return cachedItems;
        }

        JsonNode response = restClient.get()
            .uri(OFFICIAL_ALLERGY_URL)
            .header("Accept", "application/json")
            .retrieve()
            .body(JsonNode.class);
        JsonNode items = response == null ? null : response.get("body");
        if (items == null || !items.isArray()) {
            throw new IllegalStateException("Unexpected response from the official allergy service");
        }

        cachedItems = items;
        cacheExpiresAt = Instant.now().plus(CACHE_DURATION);
        return cachedItems;
    }
}
