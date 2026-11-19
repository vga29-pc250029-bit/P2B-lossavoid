package jp.co.lossvoid.service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import jp.co.lossvoid.repository.ChickenPrepRepository;
import jp.co.lossvoid.repository.ChickenPrepRepository.Batch;
import jp.co.lossvoid.repository.ChickenPrepRepository.Stock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ChickenPrepService {
    public record Summary(boolean autoEnabled, int targetQty, int plannedTargetQty, int readyQty, int pendingQty,
            int customerDemandQty, int wastedTodayQty, int untrackedTodayQty,
            int bakeMinutes, int shelfLifeMinutes, LocalDateTime checkedAt, List<Batch> batches) { }

    private final ChickenPrepRepository repository;
    private final ChickenPrepPolicy policy;
    private final KitchenUpdateBroadcaster broadcaster;
    private final Clock clock;
    private final boolean autoEnabled;

    public ChickenPrepService(ChickenPrepRepository repository, ChickenPrepPolicy policy,
            KitchenUpdateBroadcaster broadcaster, Clock chickenClock,
            @Value("${app.chicken.auto.enabled:true}") boolean autoEnabled) {
        this.repository = repository;
        this.policy = policy;
        this.broadcaster = broadcaster;
        this.clock = chickenClock;
        this.autoEnabled = autoEnabled;
    }

    @Transactional
    public boolean reconcile() {
        LocalDateTime now = LocalDateTime.now(clock);
        repository.lockControl();
        int expired = repository.expire(now);
        int lapsed = repository.lapseStale(now);
        Stock stock = repository.stock(now);
        int target = policy.targetWhenBakingFinishes(now.toLocalTime());
        int quantity = autoEnabled ?
            policy.requestQuantity(target, repository.readyAt(now.plusMinutes(policy.bakeMinutes())),
                stock.pending(), stock.customerDemand()) : 0;
        if (quantity > 0) repository.request(quantity, now);
        boolean changed = expired > 0 || lapsed > 0 || quantity > 0;
        if (changed) broadcaster.notifyKitchenAfterCommit();
        return changed;
    }

    @Transactional(readOnly = true)
    public Summary summary() {
        LocalDateTime now = LocalDateTime.now(clock);
        Stock stock = repository.stock(now);
        return new Summary(autoEnabled, policy.targetAt(now.toLocalTime()),
            policy.targetWhenBakingFinishes(now.toLocalTime()), stock.ready(), stock.pending(),
            stock.customerDemand(), repository.wastedToday(now), repository.untrackedToday(now),
            policy.bakeMinutes(), policy.shelfLifeMinutes(), now, repository.visibleBatches(now));
    }

    @Transactional
    public Summary start(Long batchId) {
        LocalDateTime now = LocalDateTime.now(clock);
        repository.lockControl();
        if (repository.start(batchId, now) != 1) throw new IllegalStateException("Batch is no longer waiting");
        broadcaster.notifyKitchenAfterCommit();
        return summary();
    }

    @Transactional
    public Summary ready(Long batchId) {
        LocalDateTime now = LocalDateTime.now(clock);
        repository.lockControl();
        repository.expire(now);
        if (repository.ready(batchId, now, policy.expiresAt(now),
                now.minusMinutes(policy.bakeMinutes())) != 1) {
            throw new IllegalStateException("Baking needs " + policy.bakeMinutes()
                + " minutes after start, or the batch is already complete");
        }
        broadcaster.notifyKitchenAfterCommit();
        return summary();
    }

    @Transactional
    public Summary discard(Long batchId) {
        repository.lockControl();
        if (repository.discard(batchId) != 1) throw new IllegalStateException("Batch is not expired");
        broadcaster.notifyKitchenAfterCommit();
        return summary();
    }

    @Transactional
    public void consumeIfChicken(Long orderDetailId) {
        if (!repository.isChickenDetail(orderDetailId)) return;
        LocalDateTime now = LocalDateTime.now(clock);
        repository.lockControl();
        repository.expire(now);
        if (repository.hasUsage(orderDetailId)) return;
        Long batchId = repository.firstUsableBatch(now);
        if (batchId == null) {
            throw new IllegalStateException("焼成チキンの焼き置きがありません。System伝票の焼成完了後に操作してください");
        }
        repository.consume(batchId, now);
        repository.recordUsage(orderDetailId, batchId, now);
    }

}
