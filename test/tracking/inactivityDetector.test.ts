import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../../src/db/database";
import { SqliteRepository } from "../../src/db/repository";
import { InactivityDetector } from "../../src/tracking/inactivityDetector";
import type { InactivityRow } from "../../src/types";
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
 * File activity id used by inactivity tests.
 */
let fileActivityId: number | undefined;

/**
 * Controllable clock used by detector tests.
 */
let clock: FakeClock;

beforeEach(() => {
  database = new Database(":memory:");
  initializeDatabase(database);
  repository = new SqliteRepository(database);
  const sessionId = repository.createSession(
    "/workspace/project",
    "2026-06-24T00:00:00.000Z",
  );
  fileActivityId = repository.createFileActivity(
    sessionId,
    "/workspace/project/src/extension.ts",
    "2026-06-24T00:00:00.000Z",
  );
  clock = new FakeClock("2026-06-24T00:00:00.000Z");
});

afterEach(() => {
  database.close();
});

describe("InactivityDetector", () => {
  it("records idle only after the idle threshold is exceeded", () => {
    const detector = createDetector();
    detector.start();

    tick("2026-06-24T00:00:15.000Z", detector);
    tick("2026-06-24T00:00:30.000Z", detector);
    detector.onUserActivity("2026-06-24T00:00:45.000Z");
    tickEvery15Seconds(
      "2026-06-24T00:01:00.000Z",
      "2026-06-24T00:03:45.000Z",
      detector,
    );
    detector.onUserActivity("2026-06-24T00:04:00.000Z");

    expect(readInactivityRows()).toEqual([
      {
        id: 1,
        file_activity_id: fileActivityId,
        started_at: "2026-06-24T00:00:45.000Z",
        ended_at: "2026-06-24T00:04:00.000Z",
        type: "idle",
      },
    ]);
  });

  it("records unfocused intervals only when the threshold is met", () => {
    const detector = createDetector();
    detector.start();

    detector.onFocusChanged(false, "2026-06-24T00:00:10.000Z");
    detector.onFocusChanged(true, "2026-06-24T00:01:00.000Z");
    detector.onFocusChanged(false, "2026-06-24T00:02:00.000Z");
    detector.onFocusChanged(true, "2026-06-24T00:04:00.000Z");

    expect(readInactivityRows()).toEqual([
      {
        id: 1,
        file_activity_id: fileActivityId,
        started_at: "2026-06-24T00:02:00.000Z",
        ended_at: "2026-06-24T00:04:00.000Z",
        type: "unfocused",
      },
    ]);
  });

  it("prioritizes sleep by truncating an open idle interval", () => {
    const detector = createDetector();
    detector.start();

    tickEvery15Seconds(
      "2026-06-24T00:00:15.000Z",
      "2026-06-24T00:03:00.000Z",
      detector,
    );
    tick("2026-06-24T00:04:00.000Z", detector);

    expect(readInactivityRows()).toEqual([
      {
        id: 1,
        file_activity_id: fileActivityId,
        started_at: "2026-06-24T00:00:00.000Z",
        ended_at: "2026-06-24T00:03:00.000Z",
        type: "idle",
      },
      {
        id: 2,
        file_activity_id: fileActivityId,
        started_at: "2026-06-24T00:03:00.000Z",
        ended_at: "2026-06-24T00:04:00.000Z",
        type: "sleep",
      },
    ]);
  });

  it("prioritizes sleep by truncating an open unfocused interval", () => {
    const detector = createDetector();
    detector.start();

    detector.onFocusChanged(false, "2026-06-24T00:00:10.000Z");
    tickEvery15Seconds(
      "2026-06-24T00:00:15.000Z",
      "2026-06-24T00:02:30.000Z",
      detector,
    );
    tick("2026-06-24T00:03:30.000Z", detector);
    detector.onFocusChanged(true, "2026-06-24T00:05:30.000Z");

    expect(readInactivityRows()).toEqual([
      {
        id: 1,
        file_activity_id: fileActivityId,
        started_at: "2026-06-24T00:00:10.000Z",
        ended_at: "2026-06-24T00:02:30.000Z",
        type: "unfocused",
      },
      {
        id: 2,
        file_activity_id: fileActivityId,
        started_at: "2026-06-24T00:02:30.000Z",
        ended_at: "2026-06-24T00:03:30.000Z",
        type: "sleep",
      },
      {
        id: 3,
        file_activity_id: fileActivityId,
        started_at: "2026-06-24T00:03:30.000Z",
        ended_at: "2026-06-24T00:05:30.000Z",
        type: "unfocused",
      },
    ]);
  });

  it("does not create inactivity rows when no file activity is active", () => {
    fileActivityId = undefined;
    const detector = createDetector();
    detector.start();

    detector.onFocusChanged(false, "2026-06-24T00:00:00.000Z");
    detector.onFocusChanged(true, "2026-06-24T00:03:00.000Z");

    expect(readInactivityRows()).toEqual([]);
  });
});

/**
 * Creates a detector with short thresholds for focused tests.
 *
 * @returns Inactivity detector.
 */
function createDetector(): InactivityDetector {
  return new InactivityDetector(repository, () => fileActivityId, clock, {
    thresholds: {
      idleMs: 180_000,
      sleepMs: 60_000,
      unfocusedMs: 120_000,
    },
  });
}

/**
 * Advances the fake clock and emits a detector tick.
 *
 * @param at - UTC ISO timestamp to tick at.
 * @param detector - Detector to tick.
 */
function tick(at: string, detector: InactivityDetector): void {
  clock.set(at);
  detector.onTick();
}

/**
 * Emits detector ticks every fifteen seconds over an inclusive range.
 *
 * @param startAt - UTC ISO timestamp for the first tick.
 * @param endAt - UTC ISO timestamp for the last tick.
 * @param detector - Detector to tick.
 */
function tickEvery15Seconds(
  startAt: string,
  endAt: string,
  detector: InactivityDetector,
): void {
  const current = new Date(startAt);
  const end = new Date(endAt);

  while (current.getTime() <= end.getTime()) {
    tick(current.toISOString(), detector);
    current.setUTCSeconds(current.getUTCSeconds() + 15);
  }
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
 * Reads all inactivity rows ordered by insertion id.
 *
 * @returns Persisted inactivity rows.
 */
function readInactivityRows(): InactivityRow[] {
  return database
    .prepare<[], InactivityRow>("SELECT * FROM Inactivities ORDER BY id")
    .all();
}
