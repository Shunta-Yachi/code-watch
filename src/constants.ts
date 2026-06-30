/**
 * File name used for the extension's SQLite database in global storage.
 */
export const DB_FILE_NAME = "code-watch.sqlite";

/**
 * Interval (in milliseconds) at which the active session's heartbeat fires
 * to periodically persist tracking progress.
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Minimum duration (in milliseconds) recorded as sleep after a timer gap.
 */
export const SLEEP_THRESHOLD_MS = 60_000;

/**
 * Minimum duration (in milliseconds) recorded as unfocused time.
 */
export const UNFOCUSED_THRESHOLD_MS = 120_000;

/**
 * Minimum duration (in milliseconds) recorded as idle time.
 */
export const IDLE_THRESHOLD_MS = 180_000;

/**
 * Interval (in milliseconds) at which inactivity detection checks elapsed time.
 */
export const TICK_INTERVAL_MS = 15_000;
