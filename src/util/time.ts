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

/**
 * UTC range covering one local calendar day in the specified timezone.
 */
export interface DayRangeUtc {
  /** UTC ISO timestamp for local 00:00 at the start of the day. */
  startUtc: string;
  /** UTC ISO timestamp for local 00:00 at the start of the next day. */
  endUtc: string;
}

/**
 * Computes the UTC bounds of a local calendar day.
 *
 * @param dateLocal - Local date in `YYYY-MM-DD` format.
 * @param timeZone - IANA timezone name.
 * @returns UTC timestamps for the half-open day range.
 */
export function dayRangeUtc(dateLocal: string, timeZone: string): DayRangeUtc {
  const startUtc = zonedLocalTimeToUtc(dateLocal, timeZone);
  const endUtc = zonedLocalTimeToUtc(nextLocalDate(dateLocal), timeZone);

  return {
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
  };
}

/**
 * Formats an instant as a local date in the specified timezone.
 *
 * @param instant - Instant to format.
 * @param timeZone - IANA timezone name.
 * @returns Local date in `YYYY-MM-DD` format.
 */
export function localDateInTimeZone(instant: Date, timeZone: string): string {
  const parts = getDateTimeParts(instant, timeZone);
  return `${pad4(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/**
 * Parses a UTC ISO timestamp into epoch milliseconds.
 *
 * @param iso - UTC ISO timestamp.
 * @returns Epoch milliseconds.
 */
export function toEpochMs(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Returns the overlapping duration of two half-open UTC ISO ranges.
 *
 * @param startA - Start of the first range.
 * @param endA - End of the first range.
 * @param startB - Start of the second range.
 * @param endB - End of the second range.
 * @returns Overlap duration in milliseconds.
 */
export function overlapMs(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): number {
  const start = Math.max(toEpochMs(startA), toEpochMs(startB));
  const end = Math.min(toEpochMs(endA), toEpochMs(endB));
  return Math.max(0, end - start);
}

/**
 * Converts local midnight for a date in a timezone into a UTC instant.
 *
 * @param dateLocal - Local date in `YYYY-MM-DD` format.
 * @param timeZone - IANA timezone name.
 * @returns UTC instant matching local midnight.
 */
function zonedLocalTimeToUtc(dateLocal: string, timeZone: string): Date {
  const target = parseLocalDate(dateLocal);
  let candidateMs = Date.UTC(target.year, target.month - 1, target.day);
  const targetAsUtcMs = candidateMs;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actual = getDateTimeParts(new Date(candidateMs), timeZone);
    const actualAsUtcMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const diffMs = actualAsUtcMs - targetAsUtcMs;

    if (diffMs === 0) {
      return new Date(candidateMs);
    }

    candidateMs -= diffMs;
  }

  return new Date(candidateMs);
}

/**
 * Date and time fields formatted in a target timezone.
 */
interface DateTimeParts {
  /** Full year. */
  year: number;
  /** One-based month. */
  month: number;
  /** One-based day of month. */
  day: number;
  /** Hour in the 0-23 range. */
  hour: number;
  /** Minute in the 0-59 range. */
  minute: number;
  /** Second in the 0-59 range. */
  second: number;
}

/**
 * Formats a date in a timezone and returns numeric parts.
 *
 * @param instant - Instant to format.
 * @param timeZone - IANA timezone name.
 * @returns Numeric local date and time parts.
 */
function getDateTimeParts(instant: Date, timeZone: string): DateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(instant);

  return {
    year: readPart(parts, "year"),
    month: readPart(parts, "month"),
    day: readPart(parts, "day"),
    hour: readPart(parts, "hour"),
    minute: readPart(parts, "minute"),
    second: readPart(parts, "second"),
  };
}

/**
 * Reads a numeric Intl part by type.
 *
 * @param parts - Parts returned by `Intl.DateTimeFormat`.
 * @param type - Part type to read.
 * @returns Numeric value of the part.
 */
function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const part = parts.find((item) => item.type === type);
  if (part === undefined) {
    throw new Error(`Missing Intl date part: ${type}`);
  }

  return Number(part.value);
}

/**
 * Parses a local date string.
 *
 * @param dateLocal - Local date in `YYYY-MM-DD` format.
 * @returns Numeric date fields.
 */
function parseLocalDate(
  dateLocal: string,
): Pick<DateTimeParts, "year" | "month" | "day"> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateLocal);
  if (match === null) {
    throw new Error(`Invalid local date: ${dateLocal}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/**
 * Adds one calendar day to a local date string.
 *
 * @param dateLocal - Local date in `YYYY-MM-DD` format.
 * @returns Next local date in `YYYY-MM-DD` format.
 */
function nextLocalDate(dateLocal: string): string {
  const parsed = parseLocalDate(dateLocal);
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() + 1);

  return `${pad4(date.getUTCFullYear())}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate(),
  )}`;
}

/**
 * Pads a number to two digits.
 *
 * @param value - Number to pad.
 * @returns Padded value.
 */
function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Pads a year to four digits.
 *
 * @param value - Year to pad.
 * @returns Padded year.
 */
function pad4(value: number): string {
  return value.toString().padStart(4, "0");
}
