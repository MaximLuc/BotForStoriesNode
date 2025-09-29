export const ROLE = {
  USER: 'user',
  PREMIUM_USER: 'premium_user',
  ADMIN: 'admin',
  PREMIUM_ADMIN: 'premium_admin',
} as const
export type Role = typeof ROLE[keyof typeof ROLE]

export const ROLE_RANK: Record<Role, number> = {
  [ROLE.USER]: 0,
  [ROLE.PREMIUM_USER]: 1,
  [ROLE.ADMIN]: 2,
  [ROLE.PREMIUM_ADMIN]: 3,
}