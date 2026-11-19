package jp.co.lossvoid.repository;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import jp.co.lossvoid.bean.StaffDto;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/** 旧DBの必須列を維持しつつ、既存の認証情報を上書きしないことを確認する。 */
class StaffRepositoryTest {
    @Test
    void usesANonLoginMarkerForNewRowsInTheLegacyRequiredColumn() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        StaffRepository repository = new StaffRepository(jdbc, 1);
        repository.create(new StaffDto("T001", "Member", "EMPLOYEE", true));
        verify(jdbc).update(contains("MERGE INTO STORES"), eq(1));
        verify(jdbc).update(contains("INSERT INTO STAFFS"), eq(1), eq("T001"), eq("Member"),
            eq("!NO_LOGIN!"), eq("EMPLOYEE"), eq(1));
    }

    @Test
    void updatesMetadataWithoutOverwritingTheLegacyPasswordColumn() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        StaffRepository repository = new StaffRepository(jdbc, 1);
        repository.update("T001", new StaffDto("T001", "Changed", "EMPLOYEE", false));
        verify(jdbc).update(argThat(sql -> sql.contains("UPDATE STAFFS") && !sql.contains("PASSWORD_HASH")),
            eq("Changed"), eq("EMPLOYEE"), eq(0), eq("T001"));
    }
}
