package jp.co.lossvoid.form;

import jakarta.validation.constraints.NotBlank;

/**
 * 注文の移動先卓番を受け取る。来店情報の紐づけ直しはOrderRepositoryが担当する。
 */
public record TableChangeRequest(
    @NotBlank String table
) {
}
