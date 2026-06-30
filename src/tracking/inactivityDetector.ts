import {
  IDLE_THRESHOLD_MS,
  SLEEP_THRESHOLD_MS,
  UNFOCUSED_THRESHOLD_MS,
} from "../constants";
import type { Repository } from "../db/repository";
import type { InactivityType } from "../types";
import type { Clock } from "../util/time";
import { systemClock, toEpochMs } from "../util/time";

/**
 * Tunable inactivity thresholds.
 */
export interface InactivityThresholds {
  /** Minimum duration recorded as sleep. */
  sleepMs: number;
  /** Minimum duration recorded as unfocused time. */
  unfocusedMs: number;
  /** Minimum duration recorded as idle time. */
  idleMs: number;
}

/**
 * Options used to create an inactivity detector.
 */
export interface InactivityDetectorOptions {
  /** Threshold overrides for tests or future settings. */
  thresholds?: Partial<InactivityThresholds>;
}

/**
 * State used by the inactivity detector.
 */
type InactivityState = "ACTIVE" | "IDLE" | "UNFOCUSED";

/**
 * Detects idle, unfocused, and sleep intervals for the active file activity.
 */
export class InactivityDetector {
  /** Current detector state. */
  private state: InactivityState = "ACTIVE";

  /** Whether VS Code is currently focused. */
  private focused = true;

  /** Last timestamp at which user activity was observed. */
  private lastActivityAt: string | undefined;

  /** Last timestamp at which the periodic tick ran. */
  private lastTickAt: string | undefined;

  /** Start timestamp of the current inactive segment. */
  private segmentStart: string | undefined;

  /** File activity id captured when the current inactive segment began. */
  private segmentFileActivityId: number | undefined;

  /** Whether detection has started. */
  private started = false;

  /** Whether detection has already been finalized. */
  private stopped = false;

  /** Thresholds used for recording intervals. */
  private readonly thresholds: InactivityThresholds;

  /**
   * Creates an inactivity detector.
   *
   * @param repository - Persistence gateway used for inactivity writes.
   * @param getCurrentActivityId - Callback returning the active file activity id.
   * @param clock - Clock used when a timestamp is not supplied explicitly.
   * @param options - Optional threshold overrides.
   */
  constructor(
    private readonly repository: Repository,
    private readonly getCurrentActivityId: () => number | undefined,
    private readonly clock: Clock = systemClock,
    options: InactivityDetectorOptions = {},
  ) {
    this.thresholds = {
      sleepMs: options.thresholds?.sleepMs ?? SLEEP_THRESHOLD_MS,
      unfocusedMs: options.thresholds?.unfocusedMs ?? UNFOCUSED_THRESHOLD_MS,
      idleMs: options.thresholds?.idleMs ?? IDLE_THRESHOLD_MS,
    };
  }

  /**
   * Initializes detector state.
   *
   * @param at - Optional UTC ISO timestamp for the start.
   * @throws Error when called more than once.
   */
  start(at?: string): void {
    if (this.started) {
      throw new Error("Cannot start inactivity detector: already started");
    }

    const startedAt = at ?? this.clock.nowIso();
    this.started = true;
    this.state = "ACTIVE";
    this.focused = true;
    this.lastActivityAt = startedAt;
    this.lastTickAt = startedAt;
  }

  /**
   * Records user activity or finalizes an open idle interval.
   *
   * @param at - Optional UTC ISO timestamp for the activity.
   */
  onUserActivity(at?: string): void {
    if (!this.canHandleEvents()) {
      return;
    }

    const activityAt = at ?? this.clock.nowIso();
    if (this.state === "UNFOCUSED") {
      return;
    }

    if (this.state === "IDLE") {
      this.finalize("idle", this.requireSegmentStart(), activityAt);
      this.clearSegment();
      this.state = "ACTIVE";
    }

    this.lastActivityAt = activityAt;
  }

  /**
   * Updates focus state or finalizes an open unfocused interval.
   *
   * @param focused - Whether the VS Code window is focused.
   * @param at - Optional UTC ISO timestamp for the focus change.
   */
  onFocusChanged(focused: boolean, at?: string): void {
    if (!this.canHandleEvents()) {
      return;
    }

    const changedAt = at ?? this.clock.nowIso();
    this.focused = focused;

    if (!focused) {
      if (this.state === "IDLE") {
        this.finalize("idle", this.requireSegmentStart(), changedAt);
        this.clearSegment();
      }

      if (this.state !== "UNFOCUSED") {
        this.beginSegment("UNFOCUSED", changedAt);
      }

      return;
    }

    if (this.state === "UNFOCUSED") {
      this.finalize("unfocused", this.requireSegmentStart(), changedAt);
      this.clearSegment();
      this.state = "ACTIVE";
      this.lastActivityAt = changedAt;
    }
  }

  /**
   * Checks for sleep gaps and idle threshold crossings.
   *
   * @param at - Optional UTC ISO timestamp for the tick.
   */
  onTick(at?: string): void {
    if (!this.canHandleEvents()) {
      return;
    }

    const tickAt = at ?? this.clock.nowIso();
    const lastTickAt = this.requireLastTickAt();
    const gapMs = toEpochMs(tickAt) - toEpochMs(lastTickAt);

    if (gapMs >= this.thresholds.sleepMs) {
      this.handleSleep(lastTickAt, tickAt);
      this.lastTickAt = tickAt;
      return;
    }

    if (
      this.state === "ACTIVE" &&
      this.focused &&
      toEpochMs(tickAt) - toEpochMs(this.requireLastActivityAt()) >=
        this.thresholds.idleMs
    ) {
      this.beginSegment("IDLE", this.requireLastActivityAt());
    }

    this.lastTickAt = tickAt;
  }

  /**
   * Finalizes the current inactive segment, if any.
   *
   * @param at - Optional UTC ISO timestamp for the stop.
   */
  stop(at?: string): void {
    if (!this.canHandleEvents()) {
      return;
    }

    const stoppedAt = at ?? this.clock.nowIso();
    if (this.state === "IDLE") {
      this.finalize("idle", this.requireSegmentStart(), stoppedAt);
    } else if (this.state === "UNFOCUSED") {
      this.finalize("unfocused", this.requireSegmentStart(), stoppedAt);
    }

    this.clearSegment();
    this.state = "ACTIVE";
    this.stopped = true;
  }

  /**
   * Starts a new inactive segment.
   *
   * @param state - Inactive state represented by the segment.
   * @param start - UTC ISO timestamp at which the segment begins.
   */
  private beginSegment(state: "IDLE" | "UNFOCUSED", start: string): void {
    this.state = state;
    this.segmentStart = start;
    this.segmentFileActivityId = this.getCurrentActivityId();
  }

  /**
   * Handles a detected sleep interval, truncating any lower-priority segment.
   *
   * @param gapStart - UTC ISO timestamp at which the timer gap began.
   * @param gapEnd - UTC ISO timestamp at which the timer resumed.
   */
  private handleSleep(gapStart: string, gapEnd: string): void {
    const sleepFileActivityId =
      this.state === "ACTIVE"
        ? this.getCurrentActivityId()
        : this.segmentFileActivityId;

    if (this.state === "IDLE") {
      this.finalize("idle", this.requireSegmentStart(), gapStart);
    } else if (this.state === "UNFOCUSED") {
      this.finalize("unfocused", this.requireSegmentStart(), gapStart);
    }

    this.segmentFileActivityId = sleepFileActivityId;
    this.finalize("sleep", gapStart, gapEnd);
    this.clearSegment();
    this.lastActivityAt = gapEnd;

    if (this.focused) {
      this.state = "ACTIVE";
    } else {
      this.beginSegment("UNFOCUSED", gapEnd);
    }
  }

  /**
   * Persists an inactive interval when it meets its threshold.
   *
   * @param type - Inactivity type to record.
   * @param start - UTC ISO timestamp at which the interval started.
   * @param end - UTC ISO timestamp at which the interval ended.
   */
  private finalize(type: InactivityType, start: string, end: string): void {
    const fileActivityId = this.segmentFileActivityId;
    const durationMs = toEpochMs(end) - toEpochMs(start);

    if (fileActivityId === undefined || durationMs < this.thresholdFor(type)) {
      return;
    }

    this.repository.createInactivity(fileActivityId, type, start, end);
  }

  /**
   * Clears segment metadata.
   */
  private clearSegment(): void {
    this.segmentStart = undefined;
    this.segmentFileActivityId = undefined;
  }

  /**
   * Indicates whether event handlers should process input.
   *
   * @returns `true` when the detector is active.
   */
  private canHandleEvents(): boolean {
    return this.started && !this.stopped;
  }

  /**
   * Resolves the recording threshold for an inactivity type.
   *
   * @param type - Inactivity type.
   * @returns Threshold in milliseconds.
   */
  private thresholdFor(type: InactivityType): number {
    if (type === "sleep") {
      return this.thresholds.sleepMs;
    }

    if (type === "unfocused") {
      return this.thresholds.unfocusedMs;
    }

    return this.thresholds.idleMs;
  }

  /**
   * Reads the active segment start timestamp.
   *
   * @returns Segment start timestamp.
   * @throws Error when there is no active segment.
   */
  private requireSegmentStart(): string {
    if (this.segmentStart === undefined) {
      throw new Error("Inactive segment has not started");
    }

    return this.segmentStart;
  }

  /**
   * Reads the last activity timestamp.
   *
   * @returns Last activity timestamp.
   * @throws Error when detection has not started.
   */
  private requireLastActivityAt(): string {
    if (this.lastActivityAt === undefined) {
      throw new Error("Inactivity detector has not started");
    }

    return this.lastActivityAt;
  }

  /**
   * Reads the last tick timestamp.
   *
   * @returns Last tick timestamp.
   * @throws Error when detection has not started.
   */
  private requireLastTickAt(): string {
    if (this.lastTickAt === undefined) {
      throw new Error("Inactivity detector has not started");
    }

    return this.lastTickAt;
  }
}
