package jp.co.lossvoid.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDateTime;
import java.time.LocalTime;
import org.junit.jupiter.api.Test;

class ChickenPrepPolicyTest {
    private final ChickenPrepPolicy policy = new ChickenPrepPolicy(
        "11:00", "23:00", "11:30", "14:00", "17:30", "20:30", 6, 2, 9, 60, 12);

    @Test
    void switchesTargetsAtExactBusinessAndPeakBoundaries() {
        assertEquals(0, policy.targetAt(LocalTime.of(10, 59)));
        assertEquals(2, policy.targetAt(LocalTime.of(11, 0)));
        assertEquals(6, policy.targetAt(LocalTime.of(11, 30)));
        assertEquals(6, policy.targetAt(LocalTime.of(13, 59)));
        assertEquals(2, policy.targetAt(LocalTime.of(14, 0)));
        assertEquals(6, policy.targetAt(LocalTime.of(17, 30)));
        assertEquals(2, policy.targetAt(LocalTime.of(20, 30)));
        assertEquals(0, policy.targetAt(LocalTime.of(23, 0)));
    }

    @Test
    void requestsOnlyTheDeficitRoundedUpToAnEvenBoundedBatch() {
        assertEquals(0, policy.requestQuantity(6, 6, 0, 0));
        assertEquals(0, policy.requestQuantity(6, 4, 2, 0));
        assertEquals(2, policy.requestQuantity(6, 4, 0, 0));
        assertEquals(4, policy.requestQuantity(6, 4, 0, 1));
        assertEquals(12, policy.requestQuantity(6, 0, 0, 100));
        assertEquals(0, policy.requestQuantity(0, 0, 0, 0));
        assertEquals(0, policy.requestQuantity(0, 0, 0, 5));
    }

    @Test
    void preparesNineMinutesAheadOfOpeningAndPeakWithoutOrderingAfterClosing() {
        assertEquals(0, policy.targetWhenBakingFinishes(LocalTime.of(10, 50)));
        assertEquals(2, policy.targetWhenBakingFinishes(LocalTime.of(10, 51)));
        assertEquals(2, policy.targetWhenBakingFinishes(LocalTime.of(11, 20)));
        assertEquals(6, policy.targetWhenBakingFinishes(LocalTime.of(11, 21)));
        assertEquals(6, policy.targetWhenBakingFinishes(LocalTime.of(17, 21)));
        assertEquals(2, policy.targetWhenBakingFinishes(LocalTime.of(20, 21)));
        assertEquals(0, policy.targetWhenBakingFinishes(LocalTime.of(22, 51)));
    }

    @Test
    void expiresExactlySixtyMinutesAfterCompletion() {
        LocalDateTime ready = LocalDateTime.of(2026, 11, 12, 12, 15);
        assertEquals(ready.plusHours(1), policy.expiresAt(ready));
    }
}
