package jp.co.lossvoid.service;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 接続中のKDSへ再取得の合図をSSEで送る。接続終了・送信失敗したクライアントは一覧から外す。
 */
@Service
public class KitchenUpdateBroadcaster {
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    // 接続の完了・タイムアウト・エラーのどの場合でも参照を外し、切れた接続を保持し続けない。
    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));
        try {
            emitter.send(SseEmitter.event().name("connected").data(Instant.now().toString()));
        } catch (IOException error) {
            emitters.remove(emitter);
        }
        return emitter;
    }

    // 料理データそのものではなく更新の合図だけを送り、クライアントに最新の注文を取り直してもらう。
    public void notifyKitchen() {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("kitchen-update").data(Instant.now().toString()));
            } catch (IOException | IllegalStateException error) {
                emitters.remove(emitter);
            }
        }
    }
}
