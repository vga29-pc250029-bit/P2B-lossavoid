package jp.co.lossvoid.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import jp.co.lossvoid.bean.StaffDto;
import jp.co.lossvoid.form.StaffRequest;
import jp.co.lossvoid.repository.StaffRepository;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** DBへ接続せず、パスワードなしの担当者登録・更新と入力エラーの扱いを検証する。 */
class StaffServiceTest {
    @Test
    void registersStaffWithoutCredentials() {
        StaffRepository repository = mock(StaffRepository.class);
        StaffService service = new StaffService(repository);
        StaffDto expected = new StaffDto("T001", "Member", "EMPLOYEE", true);
        assertEquals(expected, service.createStaff(new StaffRequest("t001", " Member ", "EMPLOYEE", null)));
        verify(repository).create(expected);
    }

    @Test
    void updatesTheUrlStaffCodeWithoutAnyPasswordOperation() {
        StaffRepository repository = mock(StaffRepository.class);
        StaffService service = new StaffService(repository);
        StaffDto expected = new StaffDto("T001", "Changed", "SYSTEM_ADMIN", false);
        when(repository.update("T001", expected)).thenReturn(1);
        assertEquals(expected, service.updateStaff("t001", new StaffRequest("OTHER", " Changed ", "SYSTEM_ADMIN", false)));
        verify(repository).update("T001", expected);
    }

    @Test
    void retainsDuplicateCodeAndMissingStaffErrors() {
        StaffRepository repository = mock(StaffRepository.class);
        StaffService service = new StaffService(repository);
        StaffDto staff = new StaffDto("T001", "Member", "EMPLOYEE", true);
        doThrow(new DuplicateKeyException("duplicate")).when(repository).create(staff);
        var duplicate = assertThrows(ResponseStatusException.class, () ->
            service.createStaff(new StaffRequest("T001", "Member", "EMPLOYEE", true)));
        assertEquals(HttpStatus.CONFLICT, duplicate.getStatusCode());
        var missing = assertThrows(ResponseStatusException.class, () ->
            service.updateStaff("T002", new StaffRequest("T002", "Member", "EMPLOYEE", true)));
        assertEquals(HttpStatus.NOT_FOUND, missing.getStatusCode());
    }
}
