package jp.co.lossvoid;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Spring Bootの起動入口。コンポーネントの検出と組み込みWebサーバーの起動を開始する。
 */
@SpringBootApplication
@EnableScheduling
public class P2BLossavoidV2Application {

	@Bean
	Clock chickenClock() {
		return Clock.system(ZoneId.of("Asia/Tokyo"));
	}

	public static void main(String[] args) {
		SpringApplication.run(P2BLossavoidV2Application.class, args);
	}

}
