package jp.co.lossvoid.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;

@Component
public class ChickenPrepScheduler {
    private final ChickenPrepService service;
    private final boolean enabled;

    public ChickenPrepScheduler(ChickenPrepService service,
            @Value("${app.chicken.schedule.enabled:true}") boolean enabled) {
        this.service = service;
        this.enabled = enabled;
    }

    @Scheduled(fixedDelayString = "${app.chicken.check-interval-ms:5000}",
        initialDelayString = "${app.chicken.initial-delay-ms:1000}")
    public void replenish() {
        if (enabled) service.reconcile();
    }
}
