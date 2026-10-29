package jp.co.lossvoid.form;

import jakarta.validation.constraints.NotBlank;

/**
 * 明細の調理状態と提供フラグの更新要求。許可された状態遷移かどうかは保存処理で確認する。
 */
public record StatusUpdateRequest(
    @NotBlank String status,
    Boolean served
) {
}
