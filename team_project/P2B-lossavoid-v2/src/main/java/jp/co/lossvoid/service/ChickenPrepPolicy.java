package jp.co.lossvoid.service;

import java.time.LocalDateTime;
import java.time.LocalTime;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ChickenPrepPolicy {
    private final LocalTime opening;
    private final LocalTime closing;
    private final LocalTime lunchStart;
    private final LocalTime lunchEnd;
    private final LocalTime dinnerStart;
    private final LocalTime dinnerEnd;
    private final int peakTarget;
    private final int quietTarget;
    private final int bakeMinutes;
    private final int shelfLifeMinutes;
    private final int maxBatchQty;

    public ChickenPrepPolicy(
            @Value("${app.chicken.opening:11:00}") String opening,
            @Value("${app.chicken.closing:23:00}") String closing,
            @Value("${app.chicken.lunch-start:11:30}") String lunchStart,
            @Value("${app.chicken.lunch-end:14:00}") String lunchEnd,
            @Value("${app.chicken.dinner-start:17:30}") String dinnerStart,
            @Value("${app.chicken.dinner-end:20:30}") String dinnerEnd,
            @Value("${app.chicken.peak-target:6}") int peakTarget,
            @Value("${app.chicken.quiet-target:2}") int quietTarget,
            @Value("${app.chicken.bake-minutes:9}") int bakeMinutes,
            @Value("${app.chicken.shelf-life-minutes:60}") int shelfLifeMinutes,
            @Value("${app.chicken.max-batch-qty:12}") int maxBatchQty) {
        this.opening = LocalTime.parse(opening);
        this.closing = LocalTime.parse(closing);
        this.lunchStart = LocalTime.parse(lunchStart);
        this.lunchEnd = LocalTime.parse(lunchEnd);
        this.dinnerStart = LocalTime.parse(dinnerStart);
        this.dinnerEnd = LocalTime.parse(dinnerEnd);
        if (!this.opening.isBefore(this.closing) || !this.lunchStart.isBefore(this.lunchEnd)
                || !this.dinnerStart.isBefore(this.dinnerEnd) || peakTarget < 0 || quietTarget < 0
                || bakeMinutes < 1 || shelfLifeMinutes < 1 || maxBatchQty < 2 || maxBatchQty % 2 != 0) {
            throw new IllegalArgumentException("Invalid chicken preparation settings");
        }
        this.peakTarget = peakTarget;
        this.quietTarget = quietTarget;
        this.bakeMinutes = bakeMinutes;
        this.shelfLifeMinutes = shelfLifeMinutes;
        this.maxBatchQty = maxBatchQty;
    }

    public int targetAt(LocalTime time) {
        if (time.isBefore(opening) || !time.isBefore(closing)) return 0;
        boolean peak = inWindow(time, lunchStart, lunchEnd) || inWindow(time, dinnerStart, dinnerEnd);
        return peak ? peakTarget : quietTarget;
    }

    public int targetWhenBakingFinishes(LocalTime time) {
        return targetAt(time.plusMinutes(bakeMinutes));
    }

    public int requestQuantity(int target, int ready, int pending, int customerDemand) {
        if (target <= 0) return 0;
        long need = (long) target + Math.max(0, customerDemand)
            - Math.max(0, ready) - Math.max(0, pending);
        if (need <= 0) return 0;
        return (int) Math.min(maxBatchQty, ((need + 1) / 2) * 2);
    }

    public LocalDateTime expiresAt(LocalDateTime readyAt) {
        return readyAt.plusMinutes(shelfLifeMinutes);
    }

    public int shelfLifeMinutes() {
        return shelfLifeMinutes;
    }

    public int bakeMinutes() {
        return bakeMinutes;
    }

    private boolean inWindow(LocalTime time, LocalTime start, LocalTime end) {
        return !time.isBefore(start) && time.isBefore(end);
    }
}
