package jp.co.lossvoid.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import jp.co.lossvoid.repository.ChickenPrepRepository;
import jp.co.lossvoid.repository.ChickenPrepRepository.Stock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ChickenPrepServiceTest {
    @Mock ChickenPrepRepository repository;
    @Mock KitchenUpdateBroadcaster broadcaster;
    private ChickenPrepService service;
    private LocalDateTime now;
    private Clock clock;
    private ChickenPrepPolicy policy;

    @BeforeEach
    void setUp() {
        ZoneId zone = ZoneId.of("Asia/Tokyo");
        clock = Clock.fixed(Instant.parse("2026-11-12T03:00:00Z"), zone);
        now = LocalDateTime.of(2026, 11, 12, 12, 0);
        policy = new ChickenPrepPolicy(
            "11:00", "23:00", "11:30", "14:00", "17:30", "20:30", 6, 2, 9, 60, 12);
        service = new ChickenPrepService(repository, policy, broadcaster, clock, true);
    }

    @Test
    void createsOneEvenSystemRequestForTheMissingPeakStock() {
        when(repository.stock(now)).thenReturn(new Stock(4, 0, 1));
        when(repository.readyAt(now.plusMinutes(9))).thenReturn(4);
        service.reconcile();
        verify(repository).lockControl();
        verify(repository).request(4, now);
        verify(broadcaster).notifyKitchenAfterCommit();
    }

    @Test
    void doesNotDuplicateAnAlreadyPendingBatch() {
        when(repository.stock(now)).thenReturn(new Stock(4, 2, 0));
        when(repository.readyAt(now.plusMinutes(9))).thenReturn(4);
        service.reconcile();
        verify(repository, never()).request(anyInt(), any(LocalDateTime.class));
        verify(broadcaster, never()).notifyKitchenAfterCommit();
    }

    @Test
    void aSecondCheckDoesNotOrderTheSameSixPiecesAgain() {
        when(repository.stock(now)).thenReturn(new Stock(0, 0, 0), new Stock(0, 6, 0));
        service.reconcile();
        service.reconcile();
        verify(repository).request(6, now);
    }

    @Test
    void expiredPiecesLeaveStockAndTriggerOnlyAnEvenReplacement() {
        when(repository.expire(now)).thenReturn(1);
        when(repository.stock(now)).thenReturn(new Stock(1, 2, 0));
        when(repository.readyAt(now.plusMinutes(9))).thenReturn(1);
        service.reconcile();
        verify(repository).request(4, now);
        verify(broadcaster).notifyKitchenAfterCommit();
    }

    @Test
    void staleYesterdayRequestNoLongerBlocksTodaysBatch() {
        when(repository.lapseStale(now)).thenReturn(1);
        when(repository.stock(now)).thenReturn(new Stock(0, 0, 0));
        service.reconcile();
        verify(repository).request(6, now);
        verify(broadcaster).notifyKitchenAfterCommit();
    }

    @Test
    void stillExpiresStockWhenAutomaticOrderingIsDisabled() {
        ChickenPrepService disabled = new ChickenPrepService(repository, policy, broadcaster, clock, false);
        when(repository.expire(now)).thenReturn(1);
        when(repository.stock(now)).thenReturn(new Stock(0, 0, 0));
        disabled.reconcile();
        verify(repository, never()).request(anyInt(), any(LocalDateTime.class));
        verify(broadcaster).notifyKitchenAfterCommit();
    }

    @Test
    void allocatesTheOldestReadyBatchOncePerOrderDetail() {
        when(repository.isChickenDetail(55L)).thenReturn(true);
        when(repository.firstUsableBatch(now)).thenReturn(7L);
        service.consumeIfChicken(55L);
        verify(repository).consume(7L, now);
        verify(repository).recordUsage(55L, 7L, now);
    }

    @Test
    void rejectsChickenCompletionWhileThereIsNoBakedStock() {
        when(repository.isChickenDetail(55L)).thenReturn(true);
        when(repository.firstUsableBatch(now)).thenReturn(null);

        assertThrows(IllegalStateException.class, () -> service.consumeIfChicken(55L));

        verify(repository, never()).recordUsage(any(), any(), any(LocalDateTime.class));
    }

    @Test
    void replacesStockThatWillExpireBeforeTheNextBatchCanFinish() {
        when(repository.stock(now)).thenReturn(new Stock(6, 0, 0));
        service.reconcile();
        verify(repository).readyAt(now.plusMinutes(9));
        verify(repository).request(6, now);
    }

    @Test
    void requestsThePeakIncrementNineMinutesBeforePeakStarts() {
        LocalDateTime beforePeak = LocalDateTime.of(2026, 11, 12, 11, 21);
        Clock earlyClock = Clock.fixed(Instant.parse("2026-11-12T02:21:00Z"), ZoneId.of("Asia/Tokyo"));
        ChickenPrepService earlyService = new ChickenPrepService(repository, policy, broadcaster, earlyClock, true);
        when(repository.stock(beforePeak)).thenReturn(new Stock(2, 0, 0));
        when(repository.readyAt(beforePeak.plusMinutes(9))).thenReturn(2);
        earlyService.reconcile();
        verify(repository).request(4, beforePeak);
    }

    @Test
    void rejectsCompletionBeforeNineMinutesHaveElapsed() {
        assertThrows(IllegalStateException.class, () -> service.ready(7L));
        verify(repository).ready(7L, now, now.plusHours(1), now.minusMinutes(9));
    }
}
