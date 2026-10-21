package jp.co.lossvoid.service;

import jp.co.lossvoid.form.MergeRequest;
import jp.co.lossvoid.bean.OrderDto;
import jp.co.lossvoid.form.OrderRequest;
import jp.co.lossvoid.form.StatusUpdateRequest;
import jp.co.lossvoid.form.TableChangeRequest;
import jp.co.lossvoid.repository.OrderRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class OrderService {
    private final OrderRepository orderRepository;
    private final KitchenUpdateBroadcaster kitchenUpdateBroadcaster;

    public OrderService(OrderRepository orderRepository, KitchenUpdateBroadcaster kitchenUpdateBroadcaster) {
        this.orderRepository = orderRepository;
        this.kitchenUpdateBroadcaster = kitchenUpdateBroadcaster;
    }

    public OrderDto createOrder(OrderRequest request) {
        OrderDto order = orderRepository.create(request);
        kitchenUpdateBroadcaster.notifyKitchen();
        return order;
    }

    public List<OrderDto> getOrdersByTable(String tableNo) {
        return orderRepository.findByTable(tableNo);
    }

    public List<OrderDto> getKitchenOrders() {
        return orderRepository.findKitchenOrders();
    }

    public void changeTable(Long orderId, TableChangeRequest request) {
        orderRepository.changeTable(orderId, request);
        kitchenUpdateBroadcaster.notifyKitchen();
    }

    public void updateItemStatus(Long orderItemId, StatusUpdateRequest request) {
        orderRepository.updateItemStatus(orderItemId, request);
        kitchenUpdateBroadcaster.notifyKitchen();
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
