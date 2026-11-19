package jp.co.lossvoid.controller.kitchen;

import jp.co.lossvoid.service.ChickenPrepService;
import jp.co.lossvoid.service.ChickenPrepService.Summary;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/kitchen/chicken-prep")
public class ChickenPrepController {
    private final ChickenPrepService service;

    public ChickenPrepController(ChickenPrepService service) {
        this.service = service;
    }

    @GetMapping
    public Summary summary() {
        return service.summary();
    }

    @PatchMapping("/{batchId}/start")
    public Summary start(@PathVariable Long batchId) {
        try {
            return service.start(batchId);
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, error.getMessage(), error);
        }
    }

    @PatchMapping("/{batchId}/ready")
    public Summary ready(@PathVariable Long batchId) {
        try {
            return service.ready(batchId);
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, error.getMessage(), error);
        }
    }

    @PatchMapping("/{batchId}/discard")
    public Summary discard(@PathVariable Long batchId) {
        try {
            return service.discard(batchId);
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, error.getMessage(), error);
        }
    }
}
