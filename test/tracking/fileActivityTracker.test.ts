import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../../src/db/database";
import { SqliteRepository } from "../../src/db/repository";
import { FileActivityTracker } from "../../src/tracking/fileActivityTracker";
import type { FileRef } from "../../src/tracking/fileActivityTracker";
import type { FileActivityRow } from "../../src/types";
import type { Clock } from "../../src/util/time";

/**
 * In-memory SQLite connection used by the current test.
 */
let database: Database.Database;

/**
 * Repository instance backed by the current test database.
 */
let repository: SqliteRepository;

/**
 * Persisted session id used by file activity tests.
 */
let sessionId: number;

/**
 * Controllable clock used by tracker tests.
 */
let clock: FakeClock;

beforeEach(() => {
  database = new Database(":memory:");
  initializeDatabase(database);
  repository = new SqliteRepository(database);
  sessionId = repository.createSession(
    "/workspace/project",
    "2026-06-24T00:00:00.000Z",
  );
  clock = new FakeClock("2026-06-24T00:00:00.000Z");
});

afterEach(() => {
  database.close();
});

describe("FileActivityTracker", () => {
  it("creates an activity for the initial file editor", () => {
    const tracker = new FileActivityTracker(repository, () => sessionId, clock);

    tracker.start(file("/workspace/project/src/extension.ts"));

    expect(readFileActivityRows()).toEqual([
      {
        id: tracker.getCurrentActivityId(),
        session_id: sessionId,
        file_path: "/workspace/project/src/extension.ts",
        started_at: "2026-06-24T00:00:00.000Z",
        ended_at: "2026-06-24T00:00:00.000Z",
      },
    ]);
  });

  it("finalizes the previous activity and opens the next on active file change", () => {
    const tracker = new FileActivityTracker(repository, () => sessionId, clock);
    tracker.start(file("/workspace/project/src/extension.ts"));

    clock.set("2026-06-24T00:02:00.000Z");
    tracker.onChange(file("/workspace/project/src/view.ts"));

    expect(readFileActivityRows()).toEqual([
      {
        id: 1,
        session_id: sessionId,
        file_path: "/workspace/project/src/extension.ts",
        started_at: "2026-06-24T00:00:00.000Z",
        ended_at: "2026-06-24T00:02:00.000Z",
      },
      {
        id: 2,
        session_id: sessionId,
        file_path: "/workspace/project/src/view.ts",
        started_at: "2026-06-24T00:02:00.000Z",
        ended_at: "2026-06-24T00:02:00.000Z",
      },
    ]);
  });

  it("ignores non-file schemes while closing the previous file activity", () => {
    const tracker = new FileActivityTracker(repository, () => sessionId, clock);
    tracker.start(file("/workspace/project/src/extension.ts"));

    clock.set("2026-06-24T00:01:00.000Z");
    tracker.onChange({ scheme: "untitled", fsPath: "Untitled-1" });
    clock.set("2026-06-24T00:02:00.000Z");
    tracker.heartbeat();

    expect(tracker.getCurrentActivityId()).toBeUndefined();
    expect(readFileActivityRows()).toEqual([
      {
        id: 1,
        session_id: sessionId,
        file_path: "/workspace/project/src/extension.ts",
        started_at: "2026-06-24T00:00:00.000Z",
        ended_at: "2026-06-24T00:01:00.000Z",
      },
    ]);
  });

  it("updates and finalizes the current activity", () => {
    const tracker = new FileActivityTracker(repository, () => sessionId, clock);
    tracker.start(file("/workspace/project/src/extension.ts"));

    clock.set("2026-06-24T00:00:30.000Z");
    tracker.heartbeat();
    clock.set("2026-06-24T00:01:00.000Z");
    tracker.stop();
    clock.set("2026-06-24T00:01:30.000Z");
    tracker.heartbeat();

    expect(readFileActivityRows()).toEqual([
      {
        id: 1,
        session_id: sessionId,
        file_path: "/workspace/project/src/extension.ts",
        started_at: "2026-06-24T00:00:00.000Z",
        ended_at: "2026-06-24T00:01:00.000Z",
      },
    ]);
  });
});

/**
 * Creates a file URI reference.
 *
 * @param fsPath - Filesystem path.
 * @returns File reference.
 */
function file(fsPath: string): FileRef {
  return {
    scheme: "file",
    fsPath,
  };
}

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
 * Reads all file activity rows ordered by insertion id.
 *
 * @returns Persisted file activity rows.
 */
function readFileActivityRows(): FileActivityRow[] {
  return database
    .prepare<[], FileActivityRow>("SELECT * FROM FileActivities ORDER BY id")
    .all();
}
