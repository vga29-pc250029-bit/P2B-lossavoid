package jp.co.lossvoid.controller.kitchen;

import jp.co.lossvoid.service.KitchenUpdateBroadcaster;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * KDS向けのSSE接続を公開する。通知を受けたクライアントは注文APIを再取得する。
 */
@RestController
@RequestMapping("/api/kitchen")
public class KitchenEventController {
    private final KitchenUpdateBroadcaster broadcaster;

    public KitchenEventController(KitchenUpdateBroadcaster broadcaster) {
        this.broadcaster = broadcaster;
    }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return broadcaster.subscribe();
    }
}
