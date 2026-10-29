package jp.co.lossvoid;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Bootの起動入口。コンポーネントの検出と組み込みWebサーバーの起動を開始する。
 */
@SpringBootApplication
public class P2BLossavoidV2Application {

	public static void main(String[] args) {
		SpringApplication.run(P2BLossavoidV2Application.class, args);
	}

}
