package com.lossvoid.orderapi.service;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class KitchenUpdateBroadcaster {
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

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
