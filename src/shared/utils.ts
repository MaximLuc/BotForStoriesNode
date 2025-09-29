import type { UserDoc } from '../db/models/User'
import type { StoryDoc } from '../db/models/Story'
import { ROLE_RANK, ROLE, type Role } from './constants'

export function getUserRank(user?: UserDoc | null): number {
  const r = (user?.role as Role) || ROLE.USER
  return ROLE_RANK[r]
}

export function canAccessStory(user: UserDoc | undefined, story: StoryDoc): boolean {
  return getUserRank(user) >= (story.minRank ?? 0)
}

export function isAdmin(user?: UserDoc) {
  const r = user?.role
  return r === 'admin' || r === 'premium_admin'
}

export function isPremium(user?: UserDoc) {
  const r = user?.role
  return r === 'premium_user' || r === 'premium_admin'
}
