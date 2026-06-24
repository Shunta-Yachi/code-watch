import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../../src/db/database";
import { SqliteRepository } from "../../src/db/repository";
import type {
  FileActivityRow,
  InactivityRow,
  SessionRow,
} from "../../src/types";

/**
 * In-memory SQLite connection used by the current test.
 */
let database: Database.Database;

/**
 * Repository instance backed by the current test database.
 */
let repository: SqliteRepository;

beforeEach(() => {
  database = new Database(":memory:");
  initializeDatabase(database);
  repository = new SqliteRepository(database);
});

afterEach(() => {
  database.close();
});

describe("SqliteRepository", () => {
  it("creates and touches sessions", () => {
    const startedAt = "2026-06-24T00:00:00.000Z";
    const endedAt = "2026-06-24T00:00:30.000Z";

    const sessionId = repository.createSession("/workspace/project", startedAt);
    repository.touchSession(sessionId, endedAt);

    const row = database
      .prepare<[number], SessionRow>("SELECT * FROM Sessions WHERE id = ?")
      .get(sessionId);

    expect(row).toEqual({
      id: sessionId,
      workspace: "/workspace/project",
      started_at: startedAt,
      ended_at: endedAt,
    });
  });

  it("creates and touches file activities", () => {
    const sessionId = repository.createSession(
      "/workspace/project",
      "2026-06-24T00:00:00.000Z",
    );
    const startedAt = "2026-06-24T00:01:00.000Z";
    const endedAt = "2026-06-24T00:01:30.000Z";

    const fileActivityId = repository.createFileActivity(
      sessionId,
      "/workspace/project/src/extension.ts",
      startedAt,
    );
    repository.touchFileActivity(fileActivityId, endedAt);

    const row = database
      .prepare<
        [number],
        FileActivityRow
      >("SELECT * FROM FileActivities WHERE id = ?")
      .get(fileActivityId);

    expect(row).toEqual({
      id: fileActivityId,
      session_id: sessionId,
      file_path: "/workspace/project/src/extension.ts",
      started_at: startedAt,
      ended_at: endedAt,
    });
  });

  it("creates inactivities", () => {
    const sessionId = repository.createSession(
      "/workspace/project",
      "2026-06-24T00:00:00.000Z",
    );
    const fileActivityId = repository.createFileActivity(
      sessionId,
      "/workspace/project/src/extension.ts",
      "2026-06-24T00:01:00.000Z",
    );

    repository.createInactivity(
      fileActivityId,
      "idle",
      "2026-06-24T00:02:00.000Z",
      "2026-06-24T00:05:00.000Z",
    );

    const row = database
      .prepare<[], InactivityRow>("SELECT * FROM Inactivities")
      .get();

    expect(row).toEqual({
      id: 1,
      file_activity_id: fileActivityId,
      started_at: "2026-06-24T00:02:00.000Z",
      ended_at: "2026-06-24T00:05:00.000Z",
      type: "idle",
    });
  });

  it("throws when touching a non-existent session", () => {
    expect(() =>
      repository.touchSession(999, "2026-06-24T00:00:30.000Z"),
    ).toThrow(/no row with id=999/);
  });

  it("throws when touching a non-existent file activity", () => {
    expect(() =>
      repository.touchFileActivity(999, "2026-06-24T00:01:30.000Z"),
    ).toThrow(/no row with id=999/);
  });
});
