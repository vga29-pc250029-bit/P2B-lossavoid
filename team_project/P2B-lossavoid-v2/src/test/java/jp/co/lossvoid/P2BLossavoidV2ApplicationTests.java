package jp.co.lossvoid;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import jp.co.lossvoid.config.LossavoidSchemaInitializer;

/**
 * Springの構成を読み込めることを確認する。スキーマ初期化はモックにして起動テストでDDLを実行しない。
 */
@SpringBootTest
class P2BLossavoidV2ApplicationTests {
	@MockitoBean
	private LossavoidSchemaInitializer lossavoidSchemaInitializer;

	@Test
	void contextLoads() {
	}

}
