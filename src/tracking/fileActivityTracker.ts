import type { Repository } from "../db/repository";
import type { Clock } from "../util/time";
import { systemClock } from "../util/time";

/**
 * File-like reference projected from a VS Code text editor.
 */
export interface FileRef {
  /** URI scheme of the editor document. */
  scheme: string;
  /** Filesystem path of the editor document. */
  fsPath: string;
}

/**
 * Tracks contiguous active-file intervals for a session.
 */
export class FileActivityTracker {
  /** Identifier of the current file activity row. */
  private currentActivityId: number | undefined;

  /** Whether the tracker has already been finalized. */
  private stopped = false;

  /** Whether the tracker has been started. */
  private started = false;

  /**
   * Creates a file activity tracker.
   *
   * @param repository - Persistence gateway used for file activity writes.
   * @param getSessionId - Callback returning the current session id.
   * @param clock - Clock used when a timestamp is not supplied explicitly.
   */
  constructor(
    private readonly repository: Repository,
    private readonly getSessionId: () => number,
    private readonly clock: Clock = systemClock,
  ) {}

  /**
   * Starts tracking from the initially active file.
   *
   * @param file - Active file reference, if any.
   * @param at - Optional UTC ISO timestamp for the start.
   * @throws Error when called more than once.
   */
  start(file?: FileRef, at?: string): void {
    if (this.started) {
      throw new Error(
        "Cannot start file activity: tracker has already started",
      );
    }

    this.started = true;
    this.openNext(file, at ?? this.clock.nowIso());
  }

  /**
   * Switches to a new active file interval.
   *
   * @param file - New active file reference, if any.
   * @param at - Optional UTC ISO timestamp for the switch.
   */
  onChange(file?: FileRef, at?: string): void {
    if (!this.started || this.stopped) {
      return;
    }

    const changedAt = at ?? this.clock.nowIso();
    this.closeCurrent(changedAt);
    this.openNext(file, changedAt);
  }

  /**
   * Persists the latest observed end timestamp for the current file.
   *
   * @param at - Optional UTC ISO timestamp for the heartbeat.
   */
  heartbeat(at?: string): void {
    if (!this.started || this.stopped) {
      return;
    }

    this.touchCurrent(at ?? this.clock.nowIso());
  }

  /**
   * Finalizes the current file activity interval.
   *
   * @param at - Optional UTC ISO timestamp for the stop.
   */
  stop(at?: string): void {
    if (!this.started || this.stopped) {
      return;
    }

    this.closeCurrent(at ?? this.clock.nowIso());
    this.stopped = true;
  }

  /**
   * Current persisted file activity identifier.
   *
   * @returns File activity row identifier, or `undefined` when no file is active.
   */
  getCurrentActivityId(): number | undefined {
    return this.currentActivityId;
  }

  /**
   * Creates the next activity row when the editor points at a file URI.
   *
   * @param file - File reference to open.
   * @param at - UTC ISO timestamp used for the row start.
   */
  private openNext(file: FileRef | undefined, at: string): void {
    if (file?.scheme !== "file") {
      this.currentActivityId = undefined;
      return;
    }

    this.currentActivityId = this.repository.createFileActivity(
      this.getSessionId(),
      file.fsPath,
      at,
    );
  }

  /**
   * Updates and clears the current activity row.
   *
   * @param at - UTC ISO timestamp used for the row end.
   */
  private closeCurrent(at: string): void {
    this.touchCurrent(at);
    this.currentActivityId = undefined;
  }

  /**
   * Updates the current activity row when one exists.
   *
   * @param at - UTC ISO timestamp used for the row end.
   */
  private touchCurrent(at: string): void {
    if (this.currentActivityId !== undefined) {
      this.repository.touchFileActivity(this.currentActivityId, at);
    }
  }
}
