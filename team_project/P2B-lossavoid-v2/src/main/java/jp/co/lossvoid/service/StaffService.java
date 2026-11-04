
package jp.co.lossvoid.service;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jp.co.lossvoid.bean.StaffDto;
import jp.co.lossvoid.form.StaffRequest;
import jp.co.lossvoid.repository.StaffRepository;

/**
 * スタッフの登録、更新、削除を行う。
 * 入力された情報も確認する。
 */
@org.springframework.stereotype.Service
public class StaffService {

    private final StaffRepository staffRepository;

    // StaffRepositoryを使えるようにする
    public StaffService(StaffRepository staffRepository) {
        this.staffRepository = staffRepository;
    }

    // スタッフの一覧を取得する
    public List<StaffDto> getStaff() {
        return staffRepository.findAll();
    }

    // 新しいスタッフを登録する
    public StaffDto createStaff(@Valid StaffRequest request) {
        StaffDto staff = normalize(request);
        try {
            staffRepository.create(staff);
            return staff;
        } catch (DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "同じ従業員コードが登録されています", error);
        }
    }

    // スタッフの情報を更新する
    // 従業員コードは大文字にして使う
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

    // スタッフを削除する
    public Map<String, Boolean> deleteStaff(String code) {
        if (staffRepository.delete(normalizeCode(code)) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "従業員が見つかりません");
        }
        return Map.of("ok", true);
    }

    // 入力されたスタッフ情報を整理する
    private StaffDto normalize(StaffRequest request) {
        return new StaffDto(
            normalizeCode(request.code()),
            request.name().trim(),
            normalizeRole(request.role()),
            request.enabled() == null || request.enabled()
        );
    }

    // 従業員コードの空白を取り、大文字にする
    private String normalizeCode(String code) {
        return code.trim().toUpperCase(Locale.ROOT);
    }

    // 役割を確認する
    private String normalizeRole(String role) {
        return "SYSTEM_ADMIN".equals(role) ? "SYSTEM_ADMIN" : "EMPLOYEE";
    }
}

