export const ROLE = {
  USER: "user",
  PREMIUM_USER: "premium_user",
  ADMIN: "admin",
  PREMIUM_ADMIN: "premium_admin",
} as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

export const ROLE_RANK: Record<Role, number> = {
  [ROLE.USER]: 0,
  [ROLE.PREMIUM_USER]: 1,
  [ROLE.ADMIN]: 2,
  [ROLE.PREMIUM_ADMIN]: 3,
};

export const STORIES_PAGE_SIZE = 10;
export const NEW_STORY_WINDOW_MS = 12 * 60 * 60 * 1000;
export const NEW_BADGE_PREFIX = "🆕 ";
export const NEW_BADGE_SUFFIX = " 🆕";
export const STAR_BADGE = "⭐ ";
export const LIST_DOT_CHAR = "·";
export const LIST_DOT_WIDTH = 48;
export const TITLE_TRUNCATE_LIST = 40;
export const TITLE_TRUNCATE_BUTTON = 30;

export const STORY_PAGE_LEN_TEXT = 900; 
export const STORY_FIRST_PAGE_CAPTION_LEN = 600;
export const ENDING_PAGE_LEN_TEXT = 900;

