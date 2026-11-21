export const INTERVALS_ROW1 = [
  { label: '12 hours', ms: 12 * 60 * 60 * 1000 },
  { label: '2 days', ms: 2 * 24 * 60 * 60 * 1000 },
  { label: '4 days', ms: 4 * 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '12 days', ms: 12 * 24 * 60 * 60 * 1000 },
];

export const INTERVALS_ROW2 = [
  { label: '20 days', key: '9', ms: 20 * 24 * 60 * 60 * 1000 },
  { label: '1 month', key: '6', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '3 month', key: '7', ms: 90 * 24 * 60 * 60 * 1000 },
  { label: '6 month', key: '8', ms: 180 * 24 * 60 * 60 * 1000 },
];

export const STORAGE_KEYS = {
  WORDS: 'review_words_list',
  CURSOR: 'review_words_cursor',
  SUPABASE_URL: 'review_words_sb_url',
  SUPABASE_KEY: 'review_words_sb_key',
  SETTINGS: 'review_words_settings',
  DAILY: 'review_words_daily_goal',
};

export const DEFAULT_DAILY_GOAL = 100;
