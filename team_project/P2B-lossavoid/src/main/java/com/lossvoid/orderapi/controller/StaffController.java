package com.lossvoid.orderapi.controller;

import com.lossvoid.orderapi.dto.StaffDto;
import com.lossvoid.orderapi.dto.StaffRequest;
import com.lossvoid.orderapi.repository.StaffRepository;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/staff")
public class StaffController {
    private final StaffRepository staffRepository;
    private final PasswordEncoder passwordEncoder;

    public StaffController(StaffRepository staffRepository, PasswordEncoder passwordEncoder) {
        this.staffRepository = staffRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @GetMapping
    public List<StaffDto> getStaff() {
        return staffRepository.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StaffDto createStaff(@Valid @RequestBody StaffRequest request) {
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

    @PutMapping("/{code}")
    public StaffDto updateStaff(@PathVariable String code, @Valid @RequestBody StaffRequest request) {
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

    @DeleteMapping("/{code}")
    public Map<String, Boolean> deleteStaff(@PathVariable String code) {
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
