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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;


@org.springframework.stereotype.Service
public class StaffService {
    private final StaffRepository staffRepository;
    private final PasswordEncoder passwordEncoder;

    public StaffService(StaffRepository staffRepository, PasswordEncoder passwordEncoder) {
        this.staffRepository = staffRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<StaffDto> getStaff() {
        return staffRepository.findAll();
    }


    public StaffDto createStaff(@Valid StaffRequest request) {
        if (request.password() == null || request.password().length() < 4) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "パスワードは4文字以上で入力してください");
        }
        StaffDto staff = normalize(request);
        try {
            staffRepository.create(staff, passwordEncoder.encode(request.password()));
            return staff;
        } catch (DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "同じ従業員コードが登録されています", error);
        }
    }

    public StaffDto updateStaff(String code, @Valid StaffRequest request) {
        String normalizedCode = normalizeCode(code);
        if (request.password() != null && !request.password().isBlank() && request.password().length() < 4) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "パスワードは4文字以上で入力してください");
        }
        StaffDto staff = new StaffDto(
            normalizedCode,
            request.name().trim(),
            normalizeRole(request.role()),
            request.enabled() == null || request.enabled()
        );
        String passwordHash = request.password() == null || request.password().isBlank()
            ? null
            : passwordEncoder.encode(request.password());
        if (staffRepository.update(normalizedCode, staff, passwordHash) == 0) {
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
