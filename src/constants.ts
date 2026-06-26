/**
 * File name used for the extension's SQLite database in global storage.
 */
export const DB_FILE_NAME = "code-watch.sqlite";

/**
 * Interval (in milliseconds) at which the active session's heartbeat fires
 * to periodically persist tracking progress.
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;
