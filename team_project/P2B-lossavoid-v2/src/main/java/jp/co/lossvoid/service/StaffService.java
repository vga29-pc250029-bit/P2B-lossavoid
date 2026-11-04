package jp.co.lossvoid.service;

import jp.co.lossvoid.bean.StaffDto;
import jp.co.lossvoid.form.StaffRequest;
import jp.co.lossvoid.repository.StaffRepository;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;


/**
 * 担当者入力を正規化し、重複コードや更新対象なしをHTTPエラーへ変換する。ログイン認証は行わない。
 */
@org.springframework.stereotype.Service
public class StaffService {
    private final StaffRepository staffRepository;
    public StaffService(StaffRepository staffRepository) {
        this.staffRepository = staffRepository;
    }

    public List<StaffDto> getStaff() {
        return staffRepository.findAll();
    }


    public StaffDto createStaff(@Valid StaffRequest request) {
        StaffDto staff = normalize(request);
        try {
            staffRepository.create(staff);
            return staff;
        } catch (DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "同じ従業員コードが登録されています", error);
        }
    }

    // 更新対象のコードはURLを正規化した値で固定する。
    public StaffDto updateStaff(String code, @Valid StaffRequest request) {
        String normalizedCode = normalizeCode(code);
        StaffDto staff = new StaffDto(
            normalizedCode,
            request.name().trim(),
            normalizeRole(request.role()),
            request.enabled() == null || request.enabled()
        );
        if (staffRepository.update(normalizedCode, staff) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "従業員が見つかりません");
        }
        return staff;
    }

    public Map<String, Boolean> deleteStaff(String code) {
        if (staffRepository.delete(normalizeCode(code)) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "従業員が見つかりません");
        }
        return Map.of("ok", true);
    }

    private StaffDto normalize(StaffRequest request) {
        return new StaffDto(
            normalizeCode(request.code()),
            request.name().trim(),
            normalizeRole(request.role()),
            request.enabled() == null || request.enabled()
        );
    }

    private String normalizeCode(String code) {
        return code.trim().toUpperCase(Locale.ROOT);
    }

    private String normalizeRole(String role) {
        return "SYSTEM_ADMIN".equals(role) ? "SYSTEM_ADMIN" : "EMPLOYEE";
    }
}
