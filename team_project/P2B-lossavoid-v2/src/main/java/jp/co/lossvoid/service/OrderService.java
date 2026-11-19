package jp.co.lossvoid.service;

import jp.co.lossvoid.form.MergeRequest;
import jp.co.lossvoid.bean.OrderDto;
import jp.co.lossvoid.form.OrderRequest;
import jp.co.lossvoid.form.StatusUpdateRequest;
import jp.co.lossvoid.form.TableChangeRequest;
import jp.co.lossvoid.repository.OrderRepository;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 注文の保存処理とKDSへの更新通知をつなぐ。DBの更新処理が戻ってから再取得の合図を送る。
 */
@Service
public class OrderService {
    private final OrderRepository orderRepository;
    private final KitchenUpdateBroadcaster kitchenUpdateBroadcaster;
    private final ChickenPrepService chickenPrepService;

    public OrderService(OrderRepository orderRepository, KitchenUpdateBroadcaster kitchenUpdateBroadcaster,
            ChickenPrepService chickenPrepService) {
        this.orderRepository = orderRepository;
        this.kitchenUpdateBroadcaster = kitchenUpdateBroadcaster;
        this.chickenPrepService = chickenPrepService;
    }

    @Transactional
    public OrderDto createOrder(OrderRequest request) {
        OrderDto order = orderRepository.create(request);
        boolean chickenOrder = request.items().stream()
            .anyMatch(item -> "2402".equals(item.code()) || "2404".equals(item.code()));
        boolean prepChanged = chickenOrder && chickenPrepService.reconcile();
        if (!prepChanged) kitchenUpdateBroadcaster.notifyKitchenAfterCommit();
        return order;
    }

    public List<OrderDto> getOrdersByTable(String tableNo) {
        return orderRepository.findByTable(tableNo);
    }

    @Transactional
    public List<OrderDto> getKitchenOrders() {
        orderRepository.markFloorItemsKitchenReady();
        return orderRepository.findKitchenOrders();
    }

    public void changeTable(Long orderId, TableChangeRequest request) {
        orderRepository.changeTable(orderId, request);
        kitchenUpdateBroadcaster.notifyKitchen();
    }

    @Transactional
    public void updateItemStatus(Long orderItemId, StatusUpdateRequest request) {
        orderRepository.updateItemStatus(orderItemId, request);
        String status = request.status().trim().toUpperCase(Locale.ROOT);
        if ("KITCHEN_READY".equals(status) ||
                (("DONE".equals(status) || "COMPLETED".equals(status)) && Boolean.TRUE.equals(request.served()))) {
            chickenPrepService.consumeIfChicken(orderItemId);
        }
        kitchenUpdateBroadcaster.notifyKitchenAfterCommit();
    }

    public void cancelOrder(Long orderId) {
        orderRepository.cancelOrder(orderId);
        kitchenUpdateBroadcaster.notifyKitchen();
    }

    public void cancelOneItem(Long orderId, Long orderItemId) {
        orderRepository.cancelOneItem(orderId, orderItemId);
        kitchenUpdateBroadcaster.notifyKitchen();
    }

    public OrderDto mergeOrders(MergeRequest request) {
        OrderDto order = orderRepository.merge(request);
        kitchenUpdateBroadcaster.notifyKitchen();
        return order;
    }
}
