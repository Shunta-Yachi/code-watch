import type { Repository } from "../db/repository";
import type { Clock } from "../util/time";
import { systemClock } from "../util/time";

/**
 * Tracks a single VS Code workspace session.
 */
export class SessionTracker {
  /** Identifier of the persisted session row. */
  private currentSessionId: number | undefined;

  /** Whether the session has already been finalized. */
  private stopped = false;

  /**
   * Creates a session tracker.
   *
   * @param repository - Persistence gateway used for session writes.
   * @param workspaceId - Workspace identifier for the current VS Code window.
   * @param clock - Clock used when a timestamp is not supplied explicitly.
   */
  constructor(
    private readonly repository: Repository,
    private readonly workspaceId: string,
    private readonly clock: Clock = systemClock,
  ) {}

  /**
   * Creates the session row and stores its identifier.
   *
   * @param at - Optional UTC ISO timestamp for the session start.
   * @throws Error when called after the tracker has already started.
   */
  start(at?: string): void {
    if (this.currentSessionId !== undefined) {
      throw new Error("Cannot start session: tracker has already started");
    }

    this.currentSessionId = this.repository.createSession(
      this.workspaceId,
      at ?? this.clock.nowIso(),
    );
  }

  /**
   * Persists the latest observed session timestamp.
   *
   * @param at - Optional UTC ISO timestamp for the heartbeat.
   */
  heartbeat(at?: string): void {
    if (this.currentSessionId === undefined || this.stopped) {
      return;
    }

    this.repository.touchSession(
      this.currentSessionId,
      at ?? this.clock.nowIso(),
    );
  }

  /**
   * Finalizes the session end timestamp.
   *
   * @param at - Optional UTC ISO timestamp for the session end.
   */
  stop(at?: string): void {
    if (this.currentSessionId === undefined || this.stopped) {
      return;
    }

    this.repository.touchSession(
      this.currentSessionId,
      at ?? this.clock.nowIso(),
    );
    this.stopped = true;
  }

  /**
   * Current persisted session identifier.
   *
   * @returns Session row identifier.
   * @throws Error when the tracker has not been started.
   */
  get sessionId(): number {
    if (this.currentSessionId === undefined) {
      throw new Error("Cannot read session id: tracker has not started");
    }

    return this.currentSessionId;
  }
}
