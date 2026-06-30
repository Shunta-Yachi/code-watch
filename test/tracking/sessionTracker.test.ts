import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../../src/db/database";
import { SqliteRepository } from "../../src/db/repository";
import { SessionTracker } from "../../src/tracking/sessionTracker";
import type { Clock } from "../../src/util/time";
import type { SessionRow } from "../../src/types";

/**
 * In-memory SQLite connection used by the current test.
 */
let database: Database.Database;

/**
 * Repository instance backed by the current test database.
 */
let repository: SqliteRepository;

/**
 * Controllable clock used by session tracker tests.
 */
let clock: FakeClock;

beforeEach(() => {
  database = new Database(":memory:");
  initializeDatabase(database);
  repository = new SqliteRepository(database);
  clock = new FakeClock("2026-06-24T00:00:00.000Z");
});

afterEach(() => {
  database.close();
});

describe("SessionTracker", () => {
  it("creates a session when tracking starts", () => {
    const tracker = new SessionTracker(repository, "/workspace/project", clock);

    tracker.start();

    expect(readSessionRows()).toEqual([
      {
        id: tracker.sessionId,
        workspace: "/workspace/project",
        started_at: "2026-06-24T00:00:00.000Z",
        ended_at: "2026-06-24T00:00:00.000Z",
      },
    ]);
  });

  it("updates the session end time on heartbeat", () => {
    const tracker = new SessionTracker(repository, "/workspace/project", clock);
    tracker.start();

    clock.set("2026-06-24T00:00:30.000Z");
    tracker.heartbeat();

    expect(readSessionRows()).toEqual([
      {
        id: tracker.sessionId,
        workspace: "/workspace/project",
        started_at: "2026-06-24T00:00:00.000Z",
        ended_at: "2026-06-24T00:00:30.000Z",
      },
    ]);
  });

  it("finalizes the session end time on stop", () => {
    const tracker = new SessionTracker(repository, "/workspace/project", clock);
    tracker.start();

    clock.set("2026-06-24T00:01:00.000Z");
    tracker.stop();
    clock.set("2026-06-24T00:01:30.000Z");
    tracker.heartbeat();

    expect(readSessionRows()).toEqual([
      {
        id: tracker.sessionId,
        workspace: "/workspace/project",
        started_at: "2026-06-24T00:00:00.000Z",
        ended_at: "2026-06-24T00:01:00.000Z",
      },
    ]);
  });

  it("keeps concurrent workspace sessions independent", () => {
    const firstTracker = new SessionTracker(
      repository,
      "/workspace/first",
      clock,
    );
    const secondTracker = new SessionTracker(
      repository,
      "/workspace/second",
      clock,
    );

    firstTracker.start();
    clock.set("2026-06-24T00:00:05.000Z");
    secondTracker.start();
    clock.set("2026-06-24T00:00:30.000Z");
    firstTracker.heartbeat();
    clock.set("2026-06-24T00:00:45.000Z");
    secondTracker.heartbeat();

    expect(readSessionRows()).toEqual([
      {
        id: firstTracker.sessionId,
        workspace: "/workspace/first",
        started_at: "2026-06-24T00:00:00.000Z",
        ended_at: "2026-06-24T00:00:30.000Z",
      },
      {
        id: secondTracker.sessionId,
        workspace: "/workspace/second",
        started_at: "2026-06-24T00:00:05.000Z",
        ended_at: "2026-06-24T00:00:45.000Z",
      },
    ]);
  });

  it("rejects duplicate starts", () => {
    const tracker = new SessionTracker(repository, "/workspace/project", clock);
    tracker.start();

    expect(() => tracker.start()).toThrow(/already started/);
  });

  it("rejects reading a session id before start", () => {
    const tracker = new SessionTracker(repository, "/workspace/project", clock);

    expect(() => tracker.sessionId).toThrow(/has not started/);
  });
});

/**
 * Clock whose timestamp can be controlled by a test.
 */
class FakeClock implements Clock {
  /**
   * Creates a fake clock.
   *
   * @param currentTime - Initial UTC ISO timestamp.
   */
  constructor(private currentTime: string) {}

  /** {@inheritdoc Clock.nowIso} */
  nowIso(): string {
    return this.currentTime;
  }

  /**
   * Updates the timestamp returned by {@link nowIso}.
   *
   * @param currentTime - New UTC ISO timestamp.
   */
  set(currentTime: string): void {
    this.currentTime = currentTime;
  }
}

/**
 * Reads all session rows ordered by insertion id.
 *
 * @returns Persisted session rows.
 */
function readSessionRows(): SessionRow[] {
  return database
    .prepare<[], SessionRow>("SELECT * FROM Sessions ORDER BY id")
    .all();
}
