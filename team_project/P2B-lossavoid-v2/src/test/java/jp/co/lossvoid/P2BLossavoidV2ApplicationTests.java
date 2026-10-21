package jp.co.lossvoid;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import jp.co.lossvoid.config.StaffSchemaInitializer;

@SpringBootTest
class P2BLossavoidV2ApplicationTests {
	@MockitoBean
	private StaffSchemaInitializer staffSchemaInitializer;

	@Test
	void contextLoads() {
	}

}
