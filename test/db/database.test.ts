import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DB_FILE_NAME } from "../../src/constants";
import {
  initializeDatabase,
  openDatabase,
  openDatabaseAtPath,
} from "../../src/db/database";

/**
 * Row returned by SQLite's table list pragma.
 */
interface TableListRow {
  /** Table or view name. */
  name: string;
  /** Whether the table was created with the STRICT option. */
  strict: number;
}

/**
 * Row returned from the inactivity type seed query.
 */
interface InactivityTypeSeedRow {
  /** Seeded inactivity type key. */
  type: string;
  /** Seeded inactivity type description. */
  description: string;
}

/**
 * Temporary directories created during this test file.
 */
const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("database initialization", () => {
  it("creates the database under global storage", () => {
    const tempDir = createTempDir();
    const globalStoragePath = path.join(tempDir, "global-storage");

    const database = openDatabase({
      globalStorageUri: { fsPath: globalStoragePath },
    });

    try {
      expect(fs.existsSync(path.join(globalStoragePath, DB_FILE_NAME))).toBe(
        true,
      );
    } finally {
      database.close();
    }
  });

  it("applies connection pragmas", () => {
    const tempDir = createTempDir();
    const databasePath = path.join(tempDir, DB_FILE_NAME);
    const database = openDatabaseAtPath(databasePath);

    try {
      expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(database.pragma("busy_timeout", { simple: true })).toBe(5000);
    } finally {
      database.close();
    }
  });

  it("creates strict tables and required indexes", () => {
    const database = new Database(":memory:");

    try {
      initializeDatabase(database);

      const tableRows = database
        .prepare<[], TableListRow>("PRAGMA table_list")
        .all()
        .filter((row) =>
          [
            "Sessions",
            "InactivityTypes",
            "FileActivities",
            "Inactivities",
          ].includes(row.name),
        );
      expect(tableRows).toHaveLength(4);
      expect(tableRows.every((row) => row.strict === 1)).toBe(true);

      const indexNames = database
        .prepare<[], { name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'index'",
        )
        .all()
        .map((row) => row.name);
      expect(indexNames).toContain("idx_fileactivities_session");
      expect(indexNames).toContain("idx_inactivities_activity");
    } finally {
      database.close();
    }
  });

  it("seeds inactivity types idempotently", () => {
    const database = new Database(":memory:");

    try {
      initializeDatabase(database);
      initializeDatabase(database);

      const rows = database
        .prepare<
          [],
          InactivityTypeSeedRow
        >("SELECT type, description FROM InactivityTypes ORDER BY type")
        .all();

      expect(rows).toEqual([
        {
          type: "idle",
          description:
            "The VS Code window was focused but no activity was detected.",
        },
        {
          type: "sleep",
          description: "The computer was asleep.",
        },
        {
          type: "unfocused",
          description: "The VS Code window was not focused.",
        },
      ]);
    } finally {
      database.close();
    }
  });

  it("enforces foreign keys", () => {
    const database = new Database(":memory:");

    try {
      initializeDatabase(database);

      expect(() => {
        database
          .prepare(
            `INSERT INTO FileActivities
             (session_id, file_path, started_at, ended_at)
             VALUES (?, ?, ?, ?)`,
          )
          .run(
            999,
            "/workspace/src/example.ts",
            "2026-06-24T00:00:00.000Z",
            "2026-06-24T00:00:00.000Z",
          );
      }).toThrow();
    } finally {
      database.close();
    }
  });
});

/**
 * Creates a temporary directory tracked for cleanup.
 *
 * @returns Absolute temporary directory path.
 */
function createTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-watch-db-"));
  tempDirs.push(tempDir);
  return tempDir;
}
