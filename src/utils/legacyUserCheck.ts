// 工具函数：检查用户是否为老用户（在2025年12月29日前有效）

// 截止日期：2025年12月29日 23:59:59
const LEGACY_USER_EXPIRY_DATE = new Date('2025-12-29T23:59:59.999Z');

/**
 * 检查用户是否为老用户且在有效期内
 * @param username 用户名
 * @returns 如果是老用户且在有效期内，返回 true
 */
export function isLegacyUserActive(
  username: string | null | undefined,
): boolean {
  if (!username) {
    return false;
  }

  // 老用户权益已在 2025-12-29 23:59:59 UTC 过期，避免继续打包老用户名单。
  const now = new Date();
  if (now > LEGACY_USER_EXPIRY_DATE) {
    return false;
  }

  return false;
}
