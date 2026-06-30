import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../../src/db/database";
import { SqliteRepository } from "../../src/db/repository";
import { computeDailyAggregation } from "../../src/view/aggregation";

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

describe("computeDailyAggregation", () => {
  it("apportions activity intervals by UTC calendar day", () => {
    const sessionId = repository.createSession(
      "/workspace/project",
      "2026-06-01T22:00:00.000Z",
    );
    repository.createFileActivity(
      sessionId,
      "/workspace/project/src/extension.ts",
      "2026-06-01T22:00:00.000Z",
    );
    repository.touchFileActivity(1, "2026-06-03T02:00:00.000Z");

    expect(computeDailyAggregation(database, "2026-06-01", "UTC").totalMs).toBe(
      2 * 60 * 60 * 1000,
    );
    expect(computeDailyAggregation(database, "2026-06-02", "UTC").totalMs).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(computeDailyAggregation(database, "2026-06-03", "UTC").totalMs).toBe(
      2 * 60 * 60 * 1000,
    );
  });

  it("subtracts inactivity from file work and groups by workspace", () => {
    const firstSessionId = repository.createSession(
      "/workspace/first",
      "2026-06-24T00:00:00.000Z",
    );
    const secondSessionId = repository.createSession(
      "/workspace/second",
      "2026-06-24T00:00:00.000Z",
    );
    const firstFileId = repository.createFileActivity(
      firstSessionId,
      "/workspace/first/src/a.ts",
      "2026-06-24T00:00:00.000Z",
    );
    repository.touchFileActivity(firstFileId, "2026-06-24T02:00:00.000Z");
    repository.createInactivity(
      firstFileId,
      "idle",
      "2026-06-24T00:30:00.000Z",
      "2026-06-24T01:00:00.000Z",
    );
    const secondFileId = repository.createFileActivity(
      firstSessionId,
      "/workspace/first/src/b.ts",
      "2026-06-24T03:00:00.000Z",
    );
    repository.touchFileActivity(secondFileId, "2026-06-24T04:00:00.000Z");
    const thirdFileId = repository.createFileActivity(
      secondSessionId,
      "/workspace/second/src/c.ts",
      "2026-06-24T05:00:00.000Z",
    );
    repository.touchFileActivity(thirdFileId, "2026-06-24T06:00:00.000Z");

    expect(computeDailyAggregation(database, "2026-06-24", "UTC")).toEqual({
      date: "2026-06-24",
      totalMs: 3.5 * 60 * 60 * 1000,
      workspaces: [
        {
          workspace: "/workspace/first",
          totalMs: 2.5 * 60 * 60 * 1000,
          files: [
            {
              filePath: "/workspace/first/src/a.ts",
              workMs: 1.5 * 60 * 60 * 1000,
            },
            {
              filePath: "/workspace/first/src/b.ts",
              workMs: 60 * 60 * 1000,
            },
          ],
        },
        {
          workspace: "/workspace/second",
          totalMs: 60 * 60 * 1000,
          files: [
            {
              filePath: "/workspace/second/src/c.ts",
              workMs: 60 * 60 * 1000,
            },
          ],
        },
      ],
    });
  });

  it("uses timezone boundaries for local dates", () => {
    const sessionId = repository.createSession(
      "/workspace/project",
      "2026-06-23T15:00:00.000Z",
    );
    const fileId = repository.createFileActivity(
      sessionId,
      "/workspace/project/src/extension.ts",
      "2026-06-23T15:00:00.000Z",
    );
    repository.touchFileActivity(fileId, "2026-06-23T17:00:00.000Z");

    expect(
      computeDailyAggregation(database, "2026-06-24", "Asia/Tokyo").totalMs,
    ).toBe(2 * 60 * 60 * 1000);
  });
});
