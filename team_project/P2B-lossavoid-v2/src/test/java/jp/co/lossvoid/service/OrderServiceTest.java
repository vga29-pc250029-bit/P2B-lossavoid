package jp.co.lossvoid.service;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import jp.co.lossvoid.form.OrderItemRequest;
import jp.co.lossvoid.form.OrderRequest;
import jp.co.lossvoid.repository.OrderRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {
    @Mock OrderRepository orderRepository;
    @Mock KitchenUpdateBroadcaster broadcaster;
    @Mock ChickenPrepService chickenPrepService;
    private OrderService service;

    @BeforeEach
    void setUp() {
        service = new OrderService(orderRepository, broadcaster, chickenPrepService);
    }

    @Test
    void createsTheSystemPrepRequestImmediatelyAfterAChickenOrder() {
        OrderRequest request = orderWith("2402", 5);
        when(chickenPrepService.reconcile()).thenReturn(true);

        service.createOrder(request);

        InOrder order = inOrder(orderRepository, chickenPrepService);
        order.verify(orderRepository).create(request);
        order.verify(chickenPrepService).reconcile();
        verify(broadcaster, never()).notifyKitchenAfterCommit();
    }

    @Test
    void stillNotifiesTheKitchenWhenAnExistingBatchAlreadyCoversTheDemand() {
        OrderRequest request = orderWith("2404", 1);
        when(chickenPrepService.reconcile()).thenReturn(false);

        service.createOrder(request);

        verify(chickenPrepService).reconcile();
        verify(broadcaster).notifyKitchenAfterCommit();
    }

    @Test
    void skipsTheExtraStockCheckForAnOrderWithoutBakedChicken() {
        OrderRequest request = orderWith("2101", 1);

        service.createOrder(request);

        verify(chickenPrepService, never()).reconcile();
        verify(broadcaster).notifyKitchenAfterCommit();
    }

    @Test
    void normalizesExistingRiceBeforeLoadingKitchenOrders() {
        when(orderRepository.findKitchenOrders()).thenReturn(List.of());

        service.getKitchenOrders();

        InOrder order = inOrder(orderRepository);
        order.verify(orderRepository).markFloorItemsKitchenReady();
        order.verify(orderRepository).findKitchenOrders();
    }

    private OrderRequest orderWith(String code, int quantity) {
        return new OrderRequest("01", 2, "SELF",
            List.of(new OrderItemRequest(code, "テスト商品", 500, quantity, null)));
    }
}
