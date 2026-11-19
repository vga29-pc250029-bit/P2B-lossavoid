package jp.co.lossvoid.bean;

/**
 * 担当者管理画面へ返すコード・氏名・区分・有効状態。DBの旧互換列は含めない。
 */
public record StaffDto(
    String code,
    String name,
    String role,
    Boolean enabled
) {
}
