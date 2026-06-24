/**
 * Source of UTC timestamps used by tracking components.
 */
export interface Clock {
  /**
   * Returns the current time as a UTC ISO8601 timestamp.
   *
   * @returns Current timestamp in `Date.prototype.toISOString()` format.
   */
  nowIso(): string;
}

/**
 * Date-backed clock used by the extension at runtime.
 */
export const systemClock: Clock = {
  nowIso(): string {
    return new Date().toISOString();
  },
};
