package jp.co.lossvoid.form;

import java.util.List;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

/**
 * 合算元の注文ID群と合算先の卓番を受け取る。空の注文ID一覧や空の卓番を検証で拒否する。
 */
public record MergeRequest(
    @NotEmpty List<Long> orderIds,
    @NotBlank String table,
    String orderMethod
) {
}
